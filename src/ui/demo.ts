import type { ColorSamples, Drawable } from '../model/types';

/** The built-in sample artwork (same drawing as v16) so the page isn't empty. */
export function demoArtwork(): { drawable: Drawable; colors: ColorSamples } {
  const c = document.createElement('canvas');
  c.width = c.height = 860;
  const g = c.getContext('2d')!;
  const bg = g.createLinearGradient(0, 0, 860, 860);
  bg.addColorStop(0, '#dbe9ef');
  bg.addColorStop(0.42, '#a8d4ef');
  bg.addColorStop(1, '#efe5b8');
  g.fillStyle = bg;
  g.fillRect(0, 0, 860, 860);
  g.fillStyle = 'rgba(255,255,255,.60)';
  g.beginPath();
  g.arc(200, 270, 130, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(0,57,128,.62)';
  g.fillRect(270, 90, 170, 280);
  g.fillStyle = '#ffffff';
  g.font = '700 92px system-ui';
  g.textAlign = 'center';
  g.fillText('ART', 430, 620);
  g.font = '500 28px system-ui';
  g.fillText('NO WHITE FRAME / COLOR OVERLAY RING', 430, 665);
  // v16 hard-coded these samples for the demo.
  const colors: ColorSamples = { sample: [193, 221, 232], center: [165, 209, 237], dominant: [165, 209, 237] };
  return { drawable: { source: c, width: 860, height: 860 }, colors };
}
