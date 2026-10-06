import { t } from '../../utils/trpc';
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
import { leaveVoiceRoute } from './leave';
import { moveUserRoute } from './move';
import { pauseWatchRoute } from './pause-watch';
import { playWatchRoute } from './play-watch';
import { produceRoute } from './produce';
import { resolveRutubeRoute } from './resolve-rutube';
import { seekWatchRoute } from './seek-watch';
import { selectRutubeWatchRoute } from './select-rutube-watch';
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
  resolveRutube: resolveRutubeRoute,
  selectRutubeWatch: selectRutubeWatchRoute,
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
