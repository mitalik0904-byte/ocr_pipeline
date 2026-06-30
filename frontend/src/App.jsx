import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster } from "react-hot-toast";
import MainLayout from "./layouts/MainLayout";
import Process from "./pages/Process";
import History from "./pages/History";
import Statistics from "./pages/Statistics";
import Chat from "./pages/Chat";
import Architecture from "./pages/Architecture";

export default function App() {
  return (
    <BrowserRouter>
      <Toaster position="top-right" toastOptions={{ className: "bg-gray-900 text-white text-sm border border-gray-800" }} />
      <MainLayout>
        <Routes>
          <Route path="/" element={<Process />} />
          <Route path="/history" element={<History />} />
          <Route path="/statistics" element={<Statistics />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/architecture" element={<Architecture />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </MainLayout>
    </BrowserRouter>
  );
}
