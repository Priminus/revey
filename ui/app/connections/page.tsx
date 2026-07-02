import { SignedIn, SignedOut, RedirectToSignIn } from '@clerk/nextjs';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

export default function ConnectionsPage() {
  return (
    <main className="p-8">
      <SignedIn>
        <h1 className="text-2xl font-bold mb-4">Connections</h1>
        <div className="border rounded p-4 flex items-center justify-between max-w-md">
          <div>
            <p className="font-medium">Xero</p>
            <p className="text-sm text-gray-500">Accounting &amp; AR data source</p>
          </div>
          <a
            href={`${API_URL}/integrations/xero/connect`}
            className="bg-blue-600 text-white px-4 py-2 rounded"
          >
            Connect Xero
          </a>
        </div>
      </SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </main>
  );
}
