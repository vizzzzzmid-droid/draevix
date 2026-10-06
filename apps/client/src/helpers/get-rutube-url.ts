import { getUrlFromServer } from '@/helpers/get-file-url';
import type { TRutubeWatchSource } from '@draevix/shared';

// same signed-url shape as files: the hls player pulls master, variant,
// segment and key urls straight from this server
const getRutubeStreamUrl = (
  rutube:
    | Pick<
        TRutubeWatchSource,
        'videoId' | '_accessToken' | '_accessTokenExpiresAt'
      >
    | undefined
    | null
): string => {
  if (!rutube || !rutube._accessToken) return '';

  const params = new URLSearchParams({
    videoId: rutube.videoId,
    accessToken: rutube._accessToken,
    expires: String(rutube._accessTokenExpiresAt ?? '')
  });

  return encodeURI(
    `${getUrlFromServer()}/rutube/master.m3u8?${params.toString()}`
  );
};

export { getRutubeStreamUrl };
