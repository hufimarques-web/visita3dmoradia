import { connection } from 'next/server';
import Tour from '../components/Tour';

export default async function Page() {
  await connection();
  return <Tour />;
}
