import { NavLink } from "react-router-dom";

const menu = [
  { name: "Process", path: "/" },
  { name: "History", path: "/history" },
  { name: "Statistics", path: "/statistics" },
  { name: "RAG Chat", path: "/chat" },
  { name: "Architecture", path: "/architecture" },
];

export default function Sidebar() {
  return (
    <>
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 border-r border-gray-800 bg-gray-900 p-6 md:block">

      <h1 className="mb-2 text-2xl font-bold">
        OCR Pipeline
      </h1>
      <p className="mb-8 text-xs text-gray-500">Invoice audit workspace</p>

      <nav className="space-y-2">

        {menu.map((item) => (

          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `block rounded-lg px-4 py-3 text-sm font-semibold transition ${
                isActive
                  ? "bg-indigo-600 text-white"
                  : "hover:bg-gray-800 text-gray-300"
              }`
            }
          >
            {item.name}
          </NavLink>

        ))}

      </nav>

    </aside>
    <nav className="fixed inset-x-0 bottom-0 z-50 flex border-t border-gray-800 bg-gray-900/95 p-1 backdrop-blur md:hidden">
      {menu.slice(0, 4).map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          className={({ isActive }) =>
            `flex-1 rounded-md px-2 py-2 text-center text-[11px] font-semibold ${
              isActive ? "bg-indigo-600 text-white" : "text-gray-400"
            }`
          }
        >
          {item.name === "Statistics" ? "Stats" : item.name === "RAG Chat" ? "Chat" : item.name}
        </NavLink>
      ))}
    </nav>
    </>
  );
}
