import { connection } from 'next/server';
import { headers } from 'next/headers';
import Tour from '../components/Tour';
import scenes from '../generated/scenes.json';

export default async function Page() {
  await connection();
  const nonce = (await headers()).get('x-nonce');
  // Fragments are client-side: preload the requested scene, not always the default room.
  const sources = Object.fromEntries(scenes.map(scene => [scene.id, scene.optimizedImage]));
  const preload = `(()=>{const images=${JSON.stringify(sources).replace(/</g, '\\u003c')};const id=location.hash.slice(1);const href=Object.hasOwn(images,id)?images[id]:images.sala;const link=document.createElement('link');link.rel='preload';link.as='image';link.href=href;link.fetchPriority='high';document.head.append(link);})();`;
  return <><script nonce={nonce} dangerouslySetInnerHTML={{ __html: preload }}/><Tour /></>;
}
