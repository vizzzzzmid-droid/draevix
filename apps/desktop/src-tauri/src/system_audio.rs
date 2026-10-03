//! Windows system-audio capture for screen sharing.
//!
//! Uses the WASAPI process-loopback API in INCLUDE mode: instead of capturing
//! the whole mix and hoping our own tree is excluded (EXCLUDE mode demonstrably
//! does not exclude on Win10 19045 — remote voices leaked into the stream),
//! we enumerate the default endpoint's audio sessions and open one loopback
//! client per audible process OUTSIDE our own tree, then mix them natively.
//! Our client (and therefore every call voice it renders) can never be picked
//! up, by construction rather than by exclusion flag.
//!
//! The capture runs on a dedicated native thread and resamples everything to
//! 48 kHz stereo f32. JavaScript polls buffered chunks over `invoke` (bulk
//! request/response, no per-frame events) and feeds them into an AudioWorklet.

use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::{
    atomic::{AtomicBool, AtomicU32, AtomicU64, Ordering},
    mpsc, Arc, Mutex,
};
use std::thread::JoinHandle;
use std::time::Duration;

pub const OUTPUT_SAMPLE_RATE: u32 = 48_000;
pub const OUTPUT_CHANNELS: usize = 2;

/// Hard cap of buffered audio (2 seconds). Older frames are dropped and
/// reported as lost so a stalled consumer can never grow memory forever.
const MAX_BUFFERED_FLOATS: usize = (OUTPUT_SAMPLE_RATE as usize) * OUTPUT_CHANNELS * 2;
/// Max frames returned by a single poll call (1 second of audio).
const MAX_POLL_FLOATS: usize = (OUTPUT_SAMPLE_RATE as usize) * OUTPUT_CHANNELS;

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemAudioInfo {
    pub sample_rate: u32,
    pub channels: u32,
}

#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemAudioChunk {
    /// Interleaved stereo f32 samples at [`OUTPUT_SAMPLE_RATE`].
    pub samples: Vec<f32>,
    /// Frames dropped from the ring buffer since the previous poll.
    pub frames_lost: u64,
    /// True when the default output device changed mid-capture. The session
    /// is already stopped; the caller should start a new one.
    pub device_changed: bool,
}

struct Session {
    queue: Arc<Mutex<VecDeque<f32>>>,
    lost_total: Arc<AtomicU64>,
    lost_reported: u64,
    device_changed: Arc<AtomicBool>,
    stop: Arc<AtomicBool>,
    handle: Option<JoinHandle<()>>,
}

#[derive(Default)]
pub struct SystemAudioState {
    inner: Mutex<Option<Session>>,
}

fn stop_session_locked(session: &mut Option<Session>) {
    if let Some(active) = session.take() {
        active.stop.store(true, Ordering::SeqCst);

        if let Some(handle) = active.handle {
            // The pump wakes at least every 2 seconds, so this join is short.
            let _ = handle.join();
        }
    }
}

#[tauri::command]
pub fn system_audio_start(
    state: tauri::State<SystemAudioState>,
) -> Result<SystemAudioInfo, String> {
    let mut guard = state.inner.lock().map_err(|_| "audio state poisoned")?;

    stop_session_locked(&mut guard);

    #[cfg(windows)]
    {
        let session = windows_impl::start_session()?;

        *guard = Some(session);

        return Ok(SystemAudioInfo {
            sample_rate: OUTPUT_SAMPLE_RATE,
            channels: OUTPUT_CHANNELS as u32,
        });
    }

    #[cfg(not(windows))]
    {
        drop(guard);
        Err("system audio capture is only available on Windows".to_string())
    }
}

#[tauri::command]
pub fn system_audio_poll(
    state: tauri::State<SystemAudioState>,
) -> Result<SystemAudioChunk, String> {
    let mut guard = state.inner.lock().map_err(|_| "audio state poisoned")?;

    let session = guard
        .as_mut()
        .ok_or_else(|| "system audio capture is not running".to_string())?;

    let mut queue = session.queue.lock().map_err(|_| "audio queue poisoned")?;
    let take = queue.len().min(MAX_POLL_FLOATS);
    let samples: Vec<f32> = queue.drain(..take).collect();
    drop(queue);

    let lost_total = session.lost_total.load(Ordering::SeqCst);
    let frames_lost = lost_total.saturating_sub(session.lost_reported) / OUTPUT_CHANNELS as u64;
    session.lost_reported = lost_total;

    let device_changed = session.device_changed.load(Ordering::SeqCst);
    let finished = session
        .handle
        .as_ref()
        .is_some_and(|h| h.is_finished());

    if device_changed {
        stop_session_locked(&mut guard);

        return Ok(SystemAudioChunk {
            samples,
            frames_lost,
            device_changed: true,
        });
    }

    if finished {
        let error = windows_impl_error(session);
        stop_session_locked(&mut guard);
        return Err(error);
    }

    Ok(SystemAudioChunk {
        samples,
        frames_lost,
        device_changed: false,
    })
}

#[tauri::command]
pub fn system_audio_stop(state: tauri::State<SystemAudioState>) -> Result<(), String> {
    let mut guard = state.inner.lock().map_err(|_| "audio state poisoned")?;

    stop_session_locked(&mut guard);

    Ok(())
}

#[cfg(windows)]
fn windows_impl_error(session: &Session) -> String {
    if session.device_changed.load(Ordering::SeqCst) {
        return "default audio output device changed".to_string();
    }

    "system audio capture stopped unexpectedly".to_string()
}

#[cfg(not(windows))]
fn windows_impl_error(_session: &Session) -> String {
    "system audio capture is only available on Windows".to_string()
}

#[cfg(windows)]
mod windows_impl {
    use super::*;
    use std::ffi::c_void;
    use windows::{
        core::{Interface, GUID, HRESULT, IUnknown, PCWSTR},
        Win32::{
            Foundation::{
                CloseHandle, HANDLE, WAIT_OBJECT_0, S_OK, E_FAIL, E_NOINTERFACE,
            },
            Media::Audio::*,
            System::{
                Com::{
                    CoCreateInstance, CoInitializeEx, CoTaskMemFree, CLSCTX_ALL,
                    COINIT_MULTITHREADED,
                },
                Diagnostics::ToolHelp::{
                    CreateToolhelp32Snapshot, Process32FirstW, Process32NextW,
                    PROCESSENTRY32W, TH32CS_SNAPPROCESS,
                },
                Threading::{CreateEventW, WaitForSingleObject},
            },
        },
    };

    const WAVE_FORMAT_IEEE_FLOAT: u16 = 3;
    const WAVE_FORMAT_PCM: u16 = 1;
    const WAVE_FORMAT_EXTENSIBLE: u16 = 0xFFFE;
    // KSDATAFORMAT_SUBTYPE_IEEE_FLOAT = {00000003-0000-0010-8000-00AA00389B71}
    const SUBTYPE_IEEE_FLOAT: GUID =
        GUID::from_values(3, 0, 0x10, [0x80, 0, 0, 0xAA, 0, 0x38, 0x9B, 0x71]);
    const HNS_PER_SECOND: i64 = 10_000_000;

    pub(super) fn start_session() -> Result<Session, String> {
        let queue = Arc::new(Mutex::new(VecDeque::<f32>::with_capacity(
            MAX_BUFFERED_FLOATS,
        )));
        let lost_total = Arc::new(AtomicU64::new(0));
        let device_changed = Arc::new(AtomicBool::new(false));
        let stop = Arc::new(AtomicBool::new(false));

        let (tx, rx) = mpsc::channel::<Result<(), String>>();

        let thread_queue = Arc::clone(&queue);
        let thread_lost = Arc::clone(&lost_total);
        let thread_device_changed = Arc::clone(&device_changed);
        let thread_stop = Arc::clone(&stop);

        let handle = std::thread::spawn(move || {
            // The thread owns every COM object it creates; nothing crosses threads.
            let ready_tx = tx.clone();
            let outcome = unsafe {
                run_capture_loop(
                    thread_queue,
                    thread_lost,
                    thread_device_changed,
                    thread_stop,
                    ready_tx,
                )
            };

            // After a successful start the receiver is already gone and this
            // is a no-op. Before readiness it delivers the real startup error
            // instead of a generic timeout.
            if outcome.is_err() {
                let _ = tx.send(outcome);
            }
        });

        // Fail fast: surface activation errors to the caller instead of a dead session.
        match rx.recv_timeout(Duration::from_secs(8)) {
            Ok(Ok(())) => Ok(Session {
                queue,
                lost_total,
                lost_reported: 0,
                device_changed,
                stop,
                handle: Some(handle),
            }),
            Ok(Err(error)) => {
                let _ = handle.join();
                Err(error)
            }
            Err(_) => {
                stop.store(true, Ordering::SeqCst);
                let _ = handle.join();
                Err("[loopback/start] timed out starting system audio capture".to_string())
            }
        }
    }

    /// Hand-written COM callback for async audio-interface activation.
    /// A manual vtable only relies on rock-solid ABI shapes (IUnknown plus
    /// one method) instead of generated callback-trait names.
    #[repr(C)]
    struct LoopbackCallbackVtbl {
        query_interface: unsafe extern "system" fn(
            this: *mut c_void,
            riid: *const GUID,
            ppv: *mut *mut c_void,
        ) -> HRESULT,
        add_ref: unsafe extern "system" fn(this: *mut c_void) -> u32,
        release: unsafe extern "system" fn(this: *mut c_void) -> u32,
        activate_completed: unsafe extern "system" fn(
            this: *mut c_void,
            operation: *mut c_void,
        ) -> HRESULT,
    }

    struct LoopbackCallback {
        vtable: *const LoopbackCallbackVtbl,
        refs: AtomicU32,
        sender: Mutex<Option<mpsc::Sender<windows::core::Result<IAudioClient>>>>,
    }

    /// IActivateAudioInterfaceAsyncOperation layout: IUnknown plus GetActivateResult.
    #[repr(C)]
    struct AsyncOperationVtbl {
        _query_interface: unsafe extern "system" fn(
            *mut c_void,
            *const GUID,
            *mut *mut c_void,
        ) -> HRESULT,
        _add_ref: unsafe extern "system" fn(*mut c_void) -> u32,
        _release: unsafe extern "system" fn(*mut c_void) -> u32,
        get_activate_result: unsafe extern "system" fn(
            *mut c_void,
            *mut HRESULT,
            *mut *mut c_void,
        ) -> HRESULT,
    }

    /// Plain IUnknown layout, used to query the activated object.
    #[repr(C)]
    struct UnknownVtbl {
        query_interface: unsafe extern "system" fn(
            *mut c_void,
            *const GUID,
            *mut *mut c_void,
        ) -> HRESULT,
        _add_ref: unsafe extern "system" fn(*mut c_void) -> u32,
        release: unsafe extern "system" fn(*mut c_void) -> u32,
    }

    /// IAgileObject marker IID {94EA2B94-E9CC-49E0-C0FF-EE64CA8F5B90}
    /// (objidl.h, IID_IAgileObject). Answering it is honest here: the
    /// callback only touches an atomic refcount and a mutex-guarded sender,
    /// so it is genuinely free-threaded. OBS builds its activation handler
    /// on WRL FtmBase for the same reason; without an agility claim the
    /// activation infrastructure may reject the handler synchronously.
    const IAGILEOBJECT_IID: GUID = GUID::from_values(
        0x94ea2b94,
        0xe9cc,
        0x49e0,
        [0xc0, 0xff, 0xee, 0x64, 0xca, 0x8f, 0x5b, 0x90],
    );

    unsafe extern "system" fn callback_query_interface(
        this: *mut c_void,
        riid: *const GUID,
        ppv: *mut *mut c_void,
    ) -> HRESULT {
        if *riid == IUnknown::IID
            || *riid == IActivateAudioInterfaceCompletionHandler::IID
            || *riid == IAGILEOBJECT_IID
        {
            callback_add_ref(this);
            *ppv = this;
            S_OK
        } else {
            *ppv = std::ptr::null_mut();
            E_NOINTERFACE
        }
    }

    unsafe extern "system" fn callback_add_ref(this: *mut c_void) -> u32 {
        let ctx = &*(this as *mut LoopbackCallback);
        ctx.refs.fetch_add(1, Ordering::SeqCst) + 1
    }

    unsafe extern "system" fn callback_release(this: *mut c_void) -> u32 {
        let ctx = &*(this as *mut LoopbackCallback);

        if ctx.refs.fetch_sub(1, Ordering::SeqCst) == 1 {
            drop(Box::from_raw(this as *mut LoopbackCallback));
            return 0;
        }

        ctx.refs.load(Ordering::SeqCst)
    }

    unsafe extern "system" fn callback_activate_completed(
        this: *mut c_void,
        operation: *mut c_void,
    ) -> HRESULT {
        let result: windows::core::Result<IAudioClient> = (|| {
            let op_vtable = *(operation as *mut *const AsyncOperationVtbl);
            let mut hr = HRESULT(0);
            let mut unknown: *mut c_void = std::ptr::null_mut();

            let call_hr =
                ((*op_vtable).get_activate_result)(operation, &mut hr, &mut unknown);

            if call_hr.is_err() {
                return Err(windows::core::Error::from(call_hr));
            }

            if hr.is_err() {
                return Err(windows::core::Error::from(hr));
            }

            if unknown.is_null() {
                return Err(windows::core::Error::from(E_FAIL));
            }

            let unk_vtable = *(unknown as *mut *const UnknownVtbl);
            let mut audio_raw: *mut c_void = std::ptr::null_mut();
            let qi_hr = ((*unk_vtable).query_interface)(
                unknown,
                &IAudioClient::IID,
                &mut audio_raw,
            );

            // Balance the GetActivateResult reference either way.
            ((*unk_vtable).release)(unknown);

            if qi_hr.is_err() {
                return Err(windows::core::Error::from(qi_hr));
            }

            if audio_raw.is_null() {
                return Err(windows::core::Error::from(E_FAIL));
            }

            Ok(IAudioClient::from_raw(audio_raw))
        })();

        let ctx = &*(this as *mut LoopbackCallback);

        if let Ok(sender) = ctx.sender.lock() {
            if let Some(tx) = sender.as_ref() {
                let _ = tx.send(result);
            }
        }

        S_OK
    }

    static CALLBACK_VTABLE: LoopbackCallbackVtbl = LoopbackCallbackVtbl {
        query_interface: callback_query_interface,
        add_ref: callback_add_ref,
        release: callback_release,
        activate_completed: callback_activate_completed,
    };

    // Declared manually: only needs PCWSTR/GUID/HRESULT shapes, all certain.
    #[link(name = "mmdevapi")]
    extern "system" {
        fn ActivateAudioInterfaceAsync(
            device_interface_path: PCWSTR,
            riid: *const GUID,
            activation_params: *const c_void,
            completion_handler: *mut c_void,
            activation_operation: *mut *mut c_void,
        ) -> HRESULT;
    }

    /// Copies the full mix format (base WAVEFORMATEX plus the extensible
    /// tail) into an owned buffer. GetMixFormat usually returns
    /// WAVEFORMATEXTENSIBLE, so passing only the 18-byte base struct to
    /// Initialize fails with E_INVALIDARG.
    unsafe fn copy_mix_format(mix_ptr: *mut WAVEFORMATEX) -> Vec<u8> {
        let extra =
            std::ptr::addr_of!((*mix_ptr).cbSize).read_unaligned() as usize;
        let total = std::mem::size_of::<WAVEFORMATEX>() + extra;
        let mut buf = vec![0u8; total];
        std::ptr::copy_nonoverlapping(
            mix_ptr as *const u8,
            buf.as_mut_ptr(),
            total,
        );
        buf
    }

    /// Reads (channels, sample rate, format tag, extra bytes, float-subtype?)
    /// from an owned format buffer without touching packed fields directly.
    unsafe fn parse_mix_format(buf: &[u8]) -> (usize, u32, u16, u16, bool) {
        let base = buf.as_ptr() as *const WAVEFORMATEX;
        let channels =
            std::ptr::addr_of!((*base).nChannels).read_unaligned() as usize;
        let rate = std::ptr::addr_of!((*base).nSamplesPerSec).read_unaligned();
        let tag = std::ptr::addr_of!((*base).wFormatTag).read_unaligned();
        let extra = std::ptr::addr_of!((*base).cbSize).read_unaligned();

        let mut is_float_extensible = false;

        if tag == WAVE_FORMAT_EXTENSIBLE && extra >= 22 && buf.len() >= 40 {
            let sub = buf
                .as_ptr()
                .add(24)
                .cast::<GUID>()
                .read_unaligned();
            is_float_extensible = sub == SUBTYPE_IEEE_FLOAT;
        }

        (channels, rate, tag, extra, is_float_extensible)
    }

    /// Reads the default render endpoint's mix format into an owned buffer.
    /// Process-loopback clients are not bound to any endpoint, so their own
    /// GetMixFormat answers E_NOTIMPL (observed on Win10 19045). The loopback
    /// Initialize is therefore fed the device mix format — the same shape
    /// the engine mixes into. OBS does the equivalent by building the format
    /// itself instead of querying the loopback client.
    fn default_mix_format() -> Result<Vec<u8>, String> {
        unsafe {
            let enumerator: IMMDeviceEnumerator =
                CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
                    .map_err(|e| format!("[loopback/device-format] enumerator: {e:?}"))?;
            let device = enumerator
                .GetDefaultAudioEndpoint(eRender, eConsole)
                .map_err(|e| format!("[loopback/device-format] endpoint: {e:?}"))?;
            let device_client: IAudioClient = device
                .Activate(CLSCTX_ALL, None)
                .map_err(|e| format!("[loopback/device-format] activate: {e:?}"))?;
            let mix_ptr = device_client
                .GetMixFormat()
                .map_err(|e| format!("[loopback/device-format] mix format: {e:?}"))?;
            let format_buf = copy_mix_format(mix_ptr);
            CoTaskMemFree(Some(mix_ptr as *const c_void));

            Ok(format_buf)
        }
    }

    fn default_endpoint_id() -> Result<String, String> {
        unsafe {
            let enumerator: IMMDeviceEnumerator =
                CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
                    .map_err(|e| format!("[loopback/default-endpoint] enumerator: {e:?}"))?;
            let device = enumerator
                .GetDefaultAudioEndpoint(eRender, eConsole)
                .map_err(|e| format!("[loopback/default-endpoint] endpoint: {e:?}"))?;
            let id = device
                .GetId()
                .map_err(|e| format!("[loopback/default-endpoint] id: {e:?}"))?;
            Ok(id
                .to_string()
                .map_err(|e| format!("[loopback/default-endpoint] decode: {e}"))?)
        }
    }

    /// VT_BLOB PROPVARIANT as declared in propidl.h: u16 type @0, three u16
    /// reserved words @2/@4/@6, then the BLOB union member (u32 size @8,
    /// padding @12, data pointer @16). 24 bytes total.
    #[repr(C)]
    struct BlobPropVariant {
        vt: u16,
        reserved1: u16,
        reserved2: u16,
        reserved3: u16,
        cb_size: u32,
        _pad: u32,
        blob_data: *mut u8,
    }

    const VT_BLOB_TAG: u16 = 0x0041;

    const _: () = assert!(std::mem::size_of::<BlobPropVariant>() == 24);
    const _: () =
        assert!(std::mem::offset_of!(BlobPropVariant, cb_size) == 8);
    const _: () =
        assert!(std::mem::offset_of!(BlobPropVariant, blob_data) == 16);

    /// pid -> parent pid for every live process, via a Toolhelp snapshot.
    fn process_parent_map() -> HashMap<u32, u32> {
        let mut parent_of: HashMap<u32, u32> = HashMap::new();

        unsafe {
            let snapshot = match CreateToolhelp32Snapshot(TH32CS_SNAPPROCESS, 0) {
                Ok(handle) => handle,
                Err(_) => return parent_of,
            };

            if snapshot.is_invalid() {
                return parent_of;
            }

            let mut entry: PROCESSENTRY32W = std::mem::zeroed();
            entry.dwSize = std::mem::size_of::<PROCESSENTRY32W>() as u32;

            if Process32FirstW(snapshot, &mut entry).is_ok() {
                loop {
                    parent_of.insert(entry.th32ProcessID, entry.th32ParentProcessID);

                    if Process32NextW(snapshot, &mut entry).is_err() {
                        break;
                    }
                }
            }

            let _ = CloseHandle(snapshot);
        }

        parent_of
    }

    /// All PIDs in our own process tree (ourselves plus every descendant),
    /// resolved live via a Toolhelp snapshot so WebView2 children spawned at
    /// any moment are covered.
    fn our_tree_pids() -> HashSet<u32> {
        let parent_of = process_parent_map();
        let own = std::process::id();
        let mut tree = HashSet::new();
        tree.insert(own);

        // Anything whose ancestor chain reaches our pid is ours.
        for pid in parent_of.keys() {
            let mut current = *pid;

            while let Some(&parent) = parent_of.get(&current) {
                if parent == own {
                    tree.insert(*pid);
                    break;
                }

                if parent == 0 || !parent_of.contains_key(&parent) {
                    break;
                }

                current = parent;
            }
        }

        tree
    }

    /// PIDs with audio sessions on the default render endpoint that are NOT
    /// in our tree: games, players, browsers — everything the user hears
    /// except our own client (and therefore every call voice it renders).
    fn foreign_audio_pids() -> Result<Vec<u32>, String> {
        unsafe {
            let enumerator: IMMDeviceEnumerator =
                CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)
                    .map_err(|e| format!("[loopback/sessions] enumerator: {e:?}"))?;
            let device = enumerator
                .GetDefaultAudioEndpoint(eRender, eConsole)
                .map_err(|e| format!("[loopback/sessions] endpoint: {e:?}"))?;
            let manager: IAudioSessionManager = device
                .Activate(CLSCTX_ALL, None)
                .map_err(|e| format!("[loopback/sessions] session manager: {e:?}"))?;
            let list = manager
                .GetSessionEnumerator()
                .map_err(|e| format!("[loopback/sessions] list: {e:?}"))?;
            let count = list
                .GetCount()
                .map_err(|e| format!("[loopback/sessions] count: {e:?}"))?;

            let ours = our_tree_pids();
            let mut pids = HashSet::new();

            for index in 0..count {
                let session = match list.GetSession(index) {
                    Ok(session) => session,
                    Err(_) => continue,
                };
                let control: IAudioSessionControl2 = match session.cast() {
                    Ok(control) => control,
                    Err(_) => continue,
                };
                let pid = match control.GetProcessId() {
                    Ok(pid) => pid,
                    Err(_) => continue,
                };

                if !ours.contains(&pid) {
                    pids.insert(pid);
                }
            }

            Ok(pids.into_iter().collect())
        }
    }

    fn activate_pid_client(pid: u32) -> Result<IAudioClient, String> {
        // AUDIOCLIENT_ACTIVATION_PARAMS is repr(C): a 4-byte activation type
        // followed by the process-loopback union { u32 pid, i32 mode }.
        const _: () = assert!(
            std::mem::size_of::<AUDIOCLIENT_ACTIVATION_PARAMS>() == 12
        );

        unsafe {
            let mut params: AUDIOCLIENT_ACTIVATION_PARAMS = std::mem::zeroed();
            params.ActivationType = AUDIOCLIENT_ACTIVATION_TYPE_PROCESS_LOOPBACK;

            // Written by offset instead of naming the union member type, so
            // this keeps compiling even if the bindings rename it.
            // INCLUDE is deliberate (and the only mode OBS ships, proven on
            // Win10): each client captures exactly one foreign process tree,
            // and our own tree never gets a client at all — no echo by
            // construction instead of by exclusion flag.
            let base = std::ptr::from_mut(&mut params).cast::<u8>();
            std::ptr::write_unaligned(base.add(4).cast::<u32>(), pid);
            std::ptr::write_unaligned(
                base.add(8).cast::<i32>(),
                PROCESS_LOOPBACK_MODE_INCLUDE_TARGET_PROCESS_TREE.0,
            );

            // Typed VT_BLOB carrier instead of a raw byte array: same shape
            // as the C PROPVARIANT from propidl.h that OBS fills field by
            // field (vt/blob.cbSize/blob.pBlobData). Layout is verified at
            // compile time below.
            let variant = BlobPropVariant {
                vt: VT_BLOB_TAG,
                reserved1: 0,
                reserved2: 0,
                reserved3: 0,
                cb_size: std::mem::size_of::<AUDIOCLIENT_ACTIVATION_PARAMS>()
                    as u32,
                _pad: 0,
                blob_data: std::ptr::from_ref(&params).cast_mut().cast::<u8>(),
            };

            let (tx, rx) = mpsc::channel::<windows::core::Result<IAudioClient>>();

            // Reference count starts at one and belongs to the async
            // infrastructure once the call below succeeds; on a synchronous
            // failure we free it ourselves.
            let callback = Box::new(LoopbackCallback {
                vtable: &CALLBACK_VTABLE,
                refs: AtomicU32::new(1),
                sender: Mutex::new(Some(tx)),
            });
            let handler_ptr = Box::into_raw(callback) as *mut c_void;

            let mut operation: *mut c_void = std::ptr::null_mut();

            // Lifetime: `params` and `variant` are stack locals, but this
            // function blocks on `rx` below until completion or timeout, so
            // both outlive the async activation either way. The callback Box
            // (refcount 1) is owned by the async infrastructure after a
            // successful call and freed by its own Release at refcount 0;
            // on a synchronous failure we free it right here.
            let hr = ActivateAudioInterfaceAsync(
                VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK,
                &IAudioClient::IID,
                std::ptr::from_ref(&variant).cast(),
                handler_ptr,
                &mut operation,
            );

            if hr.is_err() {
                drop(Box::from_raw(handler_ptr as *mut LoopbackCallback));

                // Decode the device path so a garbled constant shows up here.
                let path = VIRTUAL_AUDIO_DEVICE_PROCESS_LOOPBACK
                    .to_string()
                    .unwrap_or_else(|_| "<undecodable>".to_string());

                return Err(format!(
                    "[loopback/activate] cannot begin loopback activation: {hr:?} (path {path:?})"
                ));
            }

            let outcome = match rx.recv_timeout(Duration::from_secs(10)) {
                Ok(Ok(client)) => Ok(client),
                Ok(Err(e)) => Err(format!(
                    "[loopback/activate-callback] loopback activation failed: {e:?}"
                )),
                Err(_) => Err(
                    "[loopback/activate-callback] timed out waiting for loopback activation"
                        .to_string(),
                ),
            };

            // Balance the async-operation reference obtained above.
            if !operation.is_null() {
                let op_vtable = *(operation as *mut *const UnknownVtbl);
                ((*op_vtable).release)(operation);
            }

            outcome
        }
    }

    /// True when `pid` descends from `ancestor` in the given parent map.
    fn is_descendant(pid: u32, ancestor: u32, parents: &HashMap<u32, u32>) -> bool {
        let mut current = pid;

        while let Some(&parent) = parents.get(&current) {
            if parent == ancestor {
                return true;
            }

            if parent == 0 || !parents.contains_key(&parent) {
                return false;
            }

            current = parent;
        }

        false
    }

    /// One live INCLUDE loopback capture for a single foreign process.
    /// ComPtrs release themselves on drop; the shared event (owned by the
    /// pump) is only borrowed for SetEventHandle.
    struct ActiveCapture {
        pid: u32,
        client: IAudioClient,
        capture: IAudioCaptureClient,
        resampler: Resampler,
        scratch: Vec<f32>,
    }

    fn open_pid_capture(
        pid: u32,
        event: HANDLE,
        format: *const WAVEFORMATEX,
        channels: usize,
        mix_rate: u32,
    ) -> Result<ActiveCapture, String> {
        let client = activate_pid_client(pid)
            .map_err(|error| format!("[loopback/activate-pid:{pid}] {error}"))?;

        unsafe {
            client
                .Initialize(
                    AUDCLNT_SHAREMODE_SHARED,
                    AUDCLNT_STREAMFLAGS_LOOPBACK | AUDCLNT_STREAMFLAGS_EVENTCALLBACK,
                    HNS_PER_SECOND,
                    0,
                    format,
                    None,
                )
                .map_err(|e| format!("[loopback/init-client:{pid}] {e:?}"))?;

            client
                .SetEventHandle(event)
                .map_err(|e| format!("[loopback/event:{pid}] {e:?}"))?;

            let capture: IAudioCaptureClient = client
                .GetService()
                .map_err(|e| format!("[loopback/capture-client:{pid}] {e:?}"))?;

            client
                .Start()
                .map_err(|e| format!("[loopback/start:{pid}] {e:?}"))?;
        }

        Ok(ActiveCapture {
            pid,
            client,
            capture,
            resampler: Resampler::new(mix_rate, channels),
            scratch: Vec::new(),
        })
    }

    fn drain_client(
        capture: &IAudioCaptureClient,
        resampler: &mut Resampler,
        is_float: bool,
        channels: usize,
        out: &mut Vec<f32>,
    ) -> Result<(), String> {
        unsafe {
            loop {
                let packet = capture
                    .GetNextPacketSize()
                    .map_err(|e| format!("[loopback/pump] packet size: {e:?}"))?;

                if packet == 0 {
                    break;
                }

                let mut data: *mut u8 = std::ptr::null_mut();
                let mut frames: u32 = 0;
                let mut flags: u32 = 0;

                capture
                    .GetBuffer(&mut data, &mut frames, &mut flags, None, None)
                    .map_err(|e| format!("[loopback/pump] get buffer: {e:?}"))?;

                if (flags as i32 & AUDCLNT_BUFFERFLAGS_SILENT.0) == 0 {
                    if is_float {
                        let raw = std::slice::from_raw_parts(
                            data as *const f32,
                            frames as usize * channels,
                        );
                        resampler.push_planar(raw, out);
                    } else {
                        let pcm = std::slice::from_raw_parts(
                            data as *const i16,
                            frames as usize * channels,
                        );
                        resampler.push_pcm16(pcm, out);
                    }
                }

                capture
                    .ReleaseBuffer(frames)
                    .map_err(|e| format!("[loopback/pump] release buffer: {e:?}"))?;
            }

            Ok(())
        }
    }

    unsafe fn run_capture_loop(
        queue: Arc<Mutex<VecDeque<f32>>>,
        lost_total: Arc<AtomicU64>,
        device_changed: Arc<AtomicBool>,
        stop: Arc<AtomicBool>,
        ready: mpsc::Sender<Result<(), String>>,
    ) -> Result<(), String> {
        let com_hr = CoInitializeEx(None, COINIT_MULTITHREADED);

        if com_hr.is_err() {
            return Err(format!("[loopback/com] COM init failed: {com_hr:?}"));
        }

        let initial_device = default_endpoint_id()?;

        // Device mix format feeds every per-PID loopback Initialize (their
        // own GetMixFormat is E_NOTIMPL — see default_mix_format).
        let format_buf = default_mix_format()?;

        let (channels, mix_rate, format_tag, extra_size, is_float_extensible) =
            parse_mix_format(&format_buf);

        if channels == 0 || mix_rate == 0 {
            return Err(
                "[loopback/mix-format] unsupported mix format from loopback client"
                    .to_string(),
            );
        }

        let is_float = if format_tag == WAVE_FORMAT_IEEE_FLOAT {
            true
        } else if format_tag == WAVE_FORMAT_PCM {
            false
        } else if format_tag == WAVE_FORMAT_EXTENSIBLE && extra_size >= 22 {
            if is_float_extensible {
                true
            } else {
                return Err(
                    "[loopback/mix-format] unsupported extensible subformat".to_string(),
                );
            }
        } else {
            return Err(format!(
                "[loopback/mix-format] unsupported mix format tag {format_tag}"
            ));
        };

        // --- event-driven capture -------------------------------------------
        // One event shared by all per-PID clients: every wake drains every
        // client, empty ones cost almost nothing.
        let event = CreateEventW(None, false, false, None)
            .map_err(|e| format!("[loopback/event] cannot create capture event: {e:?}"))?;

        struct EventGuard(HANDLE);
        impl Drop for EventGuard {
            fn drop(&mut self) {
                unsafe {
                    let _ = CloseHandle(self.0);
                }
            }
        }
        let _event_guard = EventGuard(event);

        let format_ptr = format_buf.as_ptr() as *const WAVEFORMATEX;

        // Opens INCLUDE captures for every audible foreign PID, drops dead
        // ones. Enumeration failure at start is fatal (fail fast); mid-run
        // it just keeps the current set until the next resync.
        let mut sync_pids = |captures: &mut Vec<ActiveCapture>| -> Result<(), String> {
            let all = foreign_audio_pids()?;
            let parents = process_parent_map();

            // INCLUDE captures whole trees: keep only roots, otherwise an app
            // whose parent and child both hold sessions would play twice.
            let wanted: Vec<u32> = all
                .iter()
                .filter(|pid| {
                    !all.iter().any(|other| {
                        **other != **pid && is_descendant(**pid, **other, &parents)
                    })
                })
                .copied()
                .collect();

            captures.retain(|cap| wanted.contains(&cap.pid));

            for pid in wanted {
                if captures.iter().any(|cap| cap.pid == pid) {
                    continue;
                }

                // An app may die between listing and open; a dead pid is
                // simply skipped and retried on the next resync if listed.
                if let Ok(cap) =
                    open_pid_capture(pid, event, format_ptr, channels, mix_rate)
                {
                    captures.push(cap);
                }
            }

            Ok(())
        };

        let mut captures: Vec<ActiveCapture> = Vec::new();
        sync_pids(&mut captures)
            .map_err(|error| format!("[loopback/start] {error}"))?;

        // Signal readiness: from here on the pump owns the session and the
        // caller polls for data. A later failure surfaces through poll().
        // Zero captures is fine (silence) — apps appearing later are picked
        // up by the periodic resync below.
        let _ = ready.send(Ok(()));

        let mut polls_since_device_check = 0u32;

        loop {
            if stop.load(Ordering::SeqCst) {
                for cap in &captures {
                    let _ = cap.client.Stop();
                }

                return Ok(());
            }

            let wait = WaitForSingleObject(event, 2000);

            if wait != WAIT_OBJECT_0 {
                // Timeout: re-check the stop flag and the default device below.
            }

            polls_since_device_check += 1;

            // Resync every ~6s so apps that started (or stopped) producing
            // sound join (or leave) the mix without restarting the session.
            if polls_since_device_check % 3 == 0 {
                let _ = sync_pids(&mut captures);
            }

            if polls_since_device_check >= 25 {
                polls_since_device_check = 0;

                match default_endpoint_id() {
                    Ok(current) if current != initial_device => {
                        device_changed.store(true, Ordering::SeqCst);

                        for cap in &captures {
                            let _ = cap.client.Stop();
                        }

                        return Err(
                            "[loopback/device] default audio output device changed"
                                .to_string(),
                        );
                    }
                    Err(e) => {
                        for cap in &captures {
                            let _ = cap.client.Stop();
                        }

                        return Err(e);
                    }
                    _ => {}
                }
            }

            // Drain every client into its scratch buffer, then mix down to
            // stereo with clamping. A failing client is dropped; the resync
            // reopens it if its pid is still audible.
            let mut mixed_len = 0usize;
            let mut dead: Vec<u32> = Vec::new();

            for cap in captures.iter_mut() {
                cap.scratch.clear();

                if drain_client(
                    &cap.capture,
                    &mut cap.resampler,
                    is_float,
                    channels,
                    &mut cap.scratch,
                )
                .is_err()
                {
                    dead.push(cap.pid);
                    continue;
                }

                mixed_len = mixed_len.max(cap.scratch.len());
            }

            if !dead.is_empty() {
                captures.retain(|cap| !dead.contains(&cap.pid));
            }

            if mixed_len > 0 {
                if let Ok(mut guard) = queue.lock() {
                    if guard.len() + mixed_len > MAX_BUFFERED_FLOATS {
                        let drop = guard.len() + mixed_len - MAX_BUFFERED_FLOATS;
                        guard.drain(..drop);
                        lost_total.fetch_add(drop as u64, Ordering::SeqCst);
                    }

                    for index in 0..mixed_len {
                        let mut sample = 0.0f32;

                        for cap in captures.iter() {
                            sample +=
                                cap.scratch.get(index).copied().unwrap_or(0.0);
                        }

                        guard.push_back(sample.clamp(-1.0, 1.0));
                    }
                }
            }
        }
    }

    /// Converts arbitrary mix format frames into interleaved 48 kHz stereo f32.
    struct Resampler {
        ratio: f64,
        channels: usize,
        position: f64,
        prev: [f32; 8],
        prev_valid: bool,
    }

    impl Resampler {
        fn new(mix_rate: u32, channels: usize) -> Self {
            Self {
                ratio: mix_rate as f64 / OUTPUT_SAMPLE_RATE as f64,
                channels: channels.min(8),
                position: 0.0,
                prev: [0.0; 8],
                prev_valid: false,
            }
        }

        fn push_frame(&mut self, stereo: [f32; 2], out: &mut Vec<f32>) {
            out.push(stereo[0]);
            out.push(stereo[1]);
        }

        fn to_stereo(&self, frame: &[f32]) -> [f32; 2] {
            if self.channels == 1 {
                [frame[0], frame[0]]
            } else if self.channels == 2 {
                [frame[0], frame[1]]
            } else {
                let sum: f32 = frame.iter().take(self.channels).sum();
                let mono = sum / self.channels as f32;
                [mono, mono]
            }
        }

        fn push_planar(&mut self, interleaved: &[f32], out: &mut Vec<f32>) {
            let frames = interleaved.len() / self.channels.max(1);

            for index in 0..frames {
                let base = index * self.channels;
                let stereo = self.to_stereo(&interleaved[base..base + self.channels]);

                // Linear interpolation between source frames.
                while self.position < 1.0 {
                    let alpha = self.position as f32;
                    let frame = if self.prev_valid {
                        [
                            self.prev_stereo()[0] * (1.0 - alpha) + stereo[0] * alpha,
                            self.prev_stereo()[1] * (1.0 - alpha) + stereo[1] * alpha,
                        ]
                    } else {
                        stereo
                    };
                    self.push_frame(frame, out);
                    self.position += self.ratio;
                }

                self.position -= 1.0;
                self.prev_stereo_set(stereo);
                self.prev_valid = true;
            }
        }

        fn push_pcm16(&mut self, interleaved: &[i16], out: &mut Vec<f32>) {
            const SCALE: f32 = 1.0 / 32768.0;
            let frames = interleaved.len() / self.channels.max(1);
            let mut converted = Vec::with_capacity(frames * self.channels);

            for sample in interleaved.iter().take(frames * self.channels) {
                converted.push(*sample as f32 * SCALE);
            }

            self.push_planar(&converted, out);
        }

        fn prev_stereo(&self) -> [f32; 2] {
            [self.prev[0], self.prev[1]]
        }

        fn prev_stereo_set(&mut self, stereo: [f32; 2]) {
            self.prev[0] = stereo[0];
            self.prev[1] = stereo[1];
        }
    }
}
