import './globals.css';
import './mobile.css';

export const metadata = {
  applicationName: 'Moradia',
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: 'Moradia', statusBarStyle: 'black-translucent' },
  other: { 'mobile-web-app-capable': 'yes' },
  metadataBase: new URL('https://visita3dmoradia-vvtu.vercel.app'),
  title: 'Domaine XXV — Visite a moradia em 360°',
  description: 'Conheça a Domaine XXV em Oliveirinha, Aveiro. Explore a sala, a cozinha, os quartos e o jardim numa visita imersiva em 360°.',
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website', locale: 'pt_PT', url: '/', siteName: 'Domaine XXV',
    title: 'Domaine XXV — Visite a moradia em 360°',
    description: 'Oliveirinha, Aveiro · Entre e descubra a sua próxima casa.',
    images: [{ url: '/assets/domaine-xxv-fachada-social.jpg', width: 1200, height: 630, alt: 'Fachada da Domaine XXV em Oliveirinha, Aveiro', type: 'image/jpeg' }],
  },
  twitter: {
    card: 'summary_large_image', title: 'Domaine XXV — Visite a moradia em 360°',
    description: 'Oliveirinha, Aveiro · Entre e descubra a sua próxima casa.',
    images: ['/assets/domaine-xxv-fachada-social.jpg'],
  },
  icons: { icon: '/assets/mark.svg', apple: '/icons/apple-touch-icon.png' },
};
export const viewport = {
  width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#202b27',
};

export default function RootLayout({ children }) {
  return <html lang="pt-PT"><body>{children}</body></html>;
}
