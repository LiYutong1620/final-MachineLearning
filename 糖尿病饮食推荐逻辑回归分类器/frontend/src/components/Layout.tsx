import { NavLink, Outlet } from "react-router-dom";
import { Apple, FlaskConical } from "lucide-react";

export default function Layout() {
  const linkClass = ({ isActive }: { isActive: boolean }) =>
    `flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg transition cursor-pointer ${
      isActive
        ? "bg-emerald-600 text-white shadow-sm"
        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
    }`;

  return (
    <div className="min-h-screen bg-[#fafbfc] text-gray-800 font-sans antialiased pb-20">
      <header className="bg-white border-b border-gray-100 sticky top-0 z-40 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 bg-emerald-600 rounded-lg flex items-center justify-center text-white font-extrabold text-sm">
              M
            </div>
            <div>
              <h1 className="text-sm sm:text-base font-bold text-gray-900">
                糖尿病饮食推荐逻辑回归系统
              </h1>
              <p className="text-[10px] text-gray-400">React 前端 · Python FastAPI 后端</p>
            </div>
          </div>

          <nav className="flex items-center gap-2">
            <NavLink to="/" end className={linkClass}>
              <Apple className="w-3.5 h-3.5" />
              饮食推荐
            </NavLink>
            <NavLink to="/lab" className={linkClass}>
              <FlaskConical className="w-3.5 h-3.5" />
              模型实验室
            </NavLink>
          </nav>
        </div>
      </header>

      <Outlet />

      <footer className="mt-16 border-t border-gray-100 bg-white py-6 text-center text-xs text-gray-400">
        <p className="font-bold text-gray-600">基于多分类逻辑回归的糖尿病饮食分类推荐平台</p>
        <p className="text-[10px] mt-1">数据来源：IBM IBM-ML241EN 开源食品科学特征库</p>
      </footer>
    </div>
  );
}
