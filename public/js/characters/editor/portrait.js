// Editor: portrait picker. Crops to a centred square and shrinks to a
// 256px JPEG so it stays small enough to sync over the WebSocket.
import { $ } from '../../core/dom.js';
import { cur, patchChar, touch } from '../store.js';

function resizeToDataUrl(file, size) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#2a2c2f';
      ctx.fillRect(0, 0, size, size);
      const scale = Math.max(size / img.width, size / img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.drawImage(img, (size - w) / 2, (size - h) / 2, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/jpeg', 0.85));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
    img.src = url;
  });
}

export function setPortrait(src) {
  const img = $('portraitImg');
  if (src) {
    img.src = src;
    img.style.display = 'block';
    $('portraitPh').style.display = 'none';
    $('portraitRemove').style.display = 'inline';
  } else {
    img.removeAttribute('src');
    img.style.display = 'none';
    $('portraitPh').style.display = 'inline';
    $('portraitRemove').style.display = 'none';
  }
}

export function initPortrait() {
  $('portraitBtn').addEventListener('click', () => $('portraitInput').click());
  $('portraitInput').addEventListener('change', async () => {
    const file = $('portraitInput').files[0];
    $('portraitInput').value = '';
    if (!file) return;
    try {
      const dataUrl = await resizeToDataUrl(file, 256);
      setPortrait(dataUrl);
      const c = cur();
      if (c) { c.portrait = dataUrl; touch('f:portrait'); }
      patchChar({ portrait: dataUrl });
    } catch (e) {
      alert('Could not read that image.');
    }
  });
  $('portraitRemove').addEventListener('click', () => {
    setPortrait('');
    const c = cur();
    if (c) { c.portrait = ''; touch('f:portrait'); }
    patchChar({ portrait: '' });
  });
}
