import { t } from '../../utils/trpc';
import { anilibertyDescribeRoute } from './aniliberty-describe';
import { anilibertyFranchiseRoute } from './aniliberty-franchise';
import { anilibertyRefreshRoute } from './aniliberty-refresh';
import { anilibertySearchRoute } from './aniliberty-search';
import { anilibertySelectRoute } from './aniliberty-select';
import { closeProducerRoute } from './close-producer';
import { connectConsumerTransportRoute } from './connect-consumer-transport';
import { connectProducerTransportRoute } from './connect-producer-transport';
import { consumeRoute } from './consume';
import { createConsumerTransportRoute } from './create-consumer-transport';
import { createProducerTransportRoute } from './create-producer-transport';
import {
  onMusicUpdateRoute,
  onUserJoinVoiceRoute,
  onUserLeaveVoiceRoute,
  onUserUpdateVoiceStateRoute,
  onUserVoiceMovedRoute,
  onVoiceAddExternalStreamRoute,
  onVoiceNewProducerRoute,
  onVoiceProducerClosedRoute,
  onVoiceRemoveExternalStreamRoute,
  onVoiceUpdateExternalStreamRoute,
  onWatchUpdateRoute
} from './events';
import { getMusicStateRoute } from './get-music-state';
import { getProducersRoute } from './get-producers';
import { getWatchStateRoute } from './get-watch-state';
import { joinVoiceRoute } from './join';
import { leaveVoiceRoute } from './leave';
import { moveUserRoute } from './move';
import { musicNextRoute } from './music-next';
import { musicPauseRoute } from './music-pause';
import { musicPlayRoute } from './music-play';
import { musicPlaylistRoute } from './music-playlist';
import { musicQueueAddRoute } from './music-queue-add';
import { musicQueueClearRoute } from './music-queue-clear';
import { musicQueueRemoveRoute } from './music-queue-remove';
import { musicRefreshRoute } from './music-refresh';
import { musicResumeRoute } from './music-resume';
import { musicSearchRoute } from './music-search';
import { musicSeekRoute } from './music-seek';
import { musicSetRepeatRoute } from './music-set-repeat';
import { musicSetShuffleRoute } from './music-set-shuffle';
import { musicStopRoute } from './music-stop';
import { pauseWatchRoute } from './pause-watch';
import { playWatchRoute } from './play-watch';
import { produceRoute } from './produce';
import { seekWatchRoute } from './seek-watch';
import { selectWatchFileRoute } from './select-watch-file';
import { setConsumerQualityRoute } from './set-consumer-quality';
import { stopWatchRoute } from './stop-watch';
import { updateVoiceStateRoute } from './update-state';

export const voiceRouter = t.router({
  join: joinVoiceRoute,
  leave: leaveVoiceRoute,
  moveUser: moveUserRoute,
  updateState: updateVoiceStateRoute,
  createProducerTransport: createProducerTransportRoute,
  connectProducerTransport: connectProducerTransportRoute,
  createConsumerTransport: createConsumerTransportRoute,
  connectConsumerTransport: connectConsumerTransportRoute,
  closeProducer: closeProducerRoute,
  produce: produceRoute,
  consume: consumeRoute,
  setConsumerQuality: setConsumerQualityRoute,
  getProducers: getProducersRoute,
  getWatchState: getWatchStateRoute,
  selectWatchFile: selectWatchFileRoute,
  anilibertySearch: anilibertySearchRoute,
  anilibertyDescribe: anilibertyDescribeRoute,
  anilibertyFranchise: anilibertyFranchiseRoute,
  anilibertyRefresh: anilibertyRefreshRoute,
  anilibertySelect: anilibertySelectRoute,
  playWatch: playWatchRoute,
  pauseWatch: pauseWatchRoute,
  seekWatch: seekWatchRoute,
  stopWatch: stopWatchRoute,
  getMusicState: getMusicStateRoute,
  musicSearch: musicSearchRoute,
  musicPlaylist: musicPlaylistRoute,
  musicPlay: musicPlayRoute,
  musicPause: musicPauseRoute,
  musicResume: musicResumeRoute,
  musicSeek: musicSeekRoute,
  musicSetRepeat: musicSetRepeatRoute,
  musicSetShuffle: musicSetShuffleRoute,
  musicStop: musicStopRoute,
  musicNext: musicNextRoute,
  musicRefresh: musicRefreshRoute,
  musicQueueAdd: musicQueueAddRoute,
  musicQueueRemove: musicQueueRemoveRoute,
  musicQueueClear: musicQueueClearRoute,
  onJoin: onUserJoinVoiceRoute,
  onLeave: onUserLeaveVoiceRoute,
  onUpdateState: onUserUpdateVoiceStateRoute,
  onMoved: onUserVoiceMovedRoute,
  onNewProducer: onVoiceNewProducerRoute,
  onProducerClosed: onVoiceProducerClosedRoute,
  onAddExternalStream: onVoiceAddExternalStreamRoute,
  onUpdateExternalStream: onVoiceUpdateExternalStreamRoute,
  onRemoveExternalStream: onVoiceRemoveExternalStreamRoute,
  onWatchUpdate: onWatchUpdateRoute,
  onMusicUpdate: onMusicUpdateRoute
});
