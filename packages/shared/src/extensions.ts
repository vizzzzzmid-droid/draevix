export const imageExtensions = [
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.svg',
  '.bmp',
  '.ico',
  '.tiff',
  '.tif'
];

export const videoExtensions = [
  '.mp4',
  '.mkv',
  '.mov',
  '.avi',
  '.wmv',
  '.flv',
  '.webm',
  '.mpeg',
  '.mpg',
  '.3gp'
];

export const audioExtensions = [
  '.mp3',
  '.wav',
  '.flac',
  '.aac',
  '.ogg',
  '.m4a',
  '.wma',
  '.alac'
];

export const documentExtensions = [
  '.pdf',
  '.doc',
  '.docx',
  '.xls',
  '.xlsx',
  '.ppt',
  '.pptx',
  '.txt',
  '.rtf',
  '.odt',
  '.ods',
  '.odp'
];

export enum FileCategory {
  IMAGE = 'image',
  VIDEO = 'video',
  AUDIO = 'audio',
  DOCUMENT = 'document',
  OTHER = 'other'
}

export const getFileCategory = (extension: string): FileCategory => {
  const ext = extension.toLowerCase();

  if (imageExtensions.includes(ext)) return FileCategory.IMAGE;
  if (videoExtensions.includes(ext)) return FileCategory.VIDEO;
  if (audioExtensions.includes(ext)) return FileCategory.AUDIO;
  if (documentExtensions.includes(ext)) return FileCategory.DOCUMENT;

  return FileCategory.OTHER;
};

export const isPreviewable = (file: File) => {
  const parts = file.name.split('.');
  const ext = parts.length > 1 ? `.${parts.pop()}` : '';
  const category = getFileCategory(ext);

  return category === FileCategory.IMAGE || category === FileCategory.VIDEO;
};

export const VIDEO_NOTE_FILE_PREFIX = 'video-note-';

// recorded square video messages get this prefix so the chat renderer can
// draw them as an inline square loop instead of a generic file attachment
export const isVideoNoteFileName = (name: string | null | undefined): boolean =>
  typeof name === 'string' &&
  name.toLowerCase().startsWith(VIDEO_NOTE_FILE_PREFIX) &&
  videoExtensions.includes(`.${name.split('.').pop()?.toLowerCase() ?? ''}`);
