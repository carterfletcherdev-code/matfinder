import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Add Your Gym — MatFinder',
  description: 'Submit your BJJ gym\'s open mat schedule to MatFinder.',
};

export default function AddGymLayout({ children }: { children: React.ReactNode }) {
  return children;
}
