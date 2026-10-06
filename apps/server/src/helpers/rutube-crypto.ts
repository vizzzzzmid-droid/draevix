import crypto from 'crypto';
import { getServerTokenSync } from '../db/queries/server';

// same hmac scheme as file tokens, but namespaced so a file token can never
// pass as a rutube proxy token and vice versa
const generateRutubeToken = (videoId: string, expiresAt: number): string => {
  const hmac = crypto.createHmac('sha256', getServerTokenSync());

  hmac.update(`rutube:${videoId}:${expiresAt}`);

  return hmac.digest('hex');
};

const verifyRutubeToken = (
  videoId: string,
  providedToken: string,
  expiresAt: number
): boolean => {
  if (!Number.isFinite(expiresAt) || Date.now() > expiresAt) {
    return false;
  }

  const expectedToken = generateRutubeToken(videoId, expiresAt);

  if (expectedToken.length !== providedToken.length) {
    return false;
  }

  return crypto.timingSafeEqual(
    Buffer.from(expectedToken),
    Buffer.from(providedToken)
  );
};

export { generateRutubeToken, verifyRutubeToken };
