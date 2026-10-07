import { t } from '../../utils/trpc';
import { anilibertyDescribeRoute } from './aniliberty-describe';
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
import { getProducersRoute } from './get-producers';
import { getWatchStateRoute } from './get-watch-state';
import { joinVoiceRoute } from './join';
import { kodikDescribeRoute } from './kodik-describe';
import { kodikRefreshRoute } from './kodik-refresh';
import { kodikSearchRoute } from './kodik-search';
import { kodikSelectRoute } from './kodik-select';
import { leaveVoiceRoute } from './leave';
import { moveUserRoute } from './move';
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
  anilibertyRefresh: anilibertyRefreshRoute,
  anilibertySelect: anilibertySelectRoute,
  kodikSearch: kodikSearchRoute,
  kodikDescribe: kodikDescribeRoute,
  kodikSelect: kodikSelectRoute,
  kodikRefresh: kodikRefreshRoute,
  playWatch: playWatchRoute,
  pauseWatch: pauseWatchRoute,
  seekWatch: seekWatchRoute,
  stopWatch: stopWatchRoute,
  onJoin: onUserJoinVoiceRoute,
  onLeave: onUserLeaveVoiceRoute,
  onUpdateState: onUserUpdateVoiceStateRoute,
  onMoved: onUserVoiceMovedRoute,
  onNewProducer: onVoiceNewProducerRoute,
  onProducerClosed: onVoiceProducerClosedRoute,
  onAddExternalStream: onVoiceAddExternalStreamRoute,
  onUpdateExternalStream: onVoiceUpdateExternalStreamRoute,
  onRemoveExternalStream: onVoiceRemoveExternalStreamRoute,
  onWatchUpdate: onWatchUpdateRoute
});
