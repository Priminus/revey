import {
  SignedIn,
  SignedOut,
  RedirectToSignIn,
  OrganizationSwitcher,
} from '@clerk/nextjs';

export default function Home() {
  return (
    <main className="p-8">
      <SignedIn>
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold">Revey Console</h1>
          <OrganizationSwitcher />
        </div>
        <p className="text-gray-600">Select a client to manage collections.</p>
      </SignedIn>
      <SignedOut>
        <RedirectToSignIn />
      </SignedOut>
    </main>
  );
}
