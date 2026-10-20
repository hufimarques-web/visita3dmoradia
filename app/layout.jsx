import './globals.css';
import './mobile.css';

export const metadata = {
  title: 'Moradia — Visita virtual',
  description: 'Entre e explore a moradia numa visita virtual de 360 graus.',
  icons: { icon: '/assets/mark.svg' },
};
export const viewport = {
  width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#202b27',
};

export default function RootLayout({ children }) {
  return <html lang="pt-PT"><body>{children}</body></html>;
}
