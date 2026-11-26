export type AudioFileCheck = { ok: true } | { ok: false; message: string };

/** Browser-readable MPEG-4 audio containers supported by this experiment. */
export function checkAudioFile(name: string, mime = ''): AudioFileCheck {
  const lowerName = name.toLowerCase();
  const lowerMime = mime.toLowerCase();
  if (/\.(m4p|aa|aax)$/.test(lowerName) || lowerMime.includes('protected')) {
    return { ok: false, message: 'This file is DRM-protected. Choose an authorized DRM-free M4B, M4A, or MP4 copy.' };
  }
  if (/\.(m4b|m4a|mp4)$/.test(lowerName) || lowerMime === 'audio/mp4' || lowerMime === 'video/mp4') return { ok: true };
  return { ok: false, message: 'Choose an MPEG-4 audio file ending in .m4b, .m4a, or .mp4.' };
}
