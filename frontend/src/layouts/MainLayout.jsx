import Sidebar from "../components/Sidebar";

export default function MainLayout({ children }) {
  return (
    <div className="flex min-h-screen bg-gray-950 text-white">
      <Sidebar />

      <main className="flex-1 overflow-y-auto p-4 pb-20 sm:p-6 sm:pb-20 lg:p-8">
        {children}
      </main>
    </div>
  );
}
