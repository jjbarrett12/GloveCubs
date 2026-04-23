import { Suspense } from 'react';
import { AdminLoginForm } from './AdminLoginForm';

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 text-gray-500 text-sm">
          Loading…
        </div>
      }
    >
      <AdminLoginForm />
    </Suspense>
  );
}
