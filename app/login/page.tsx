"use client";

import { useState } from "react";
import { supabase } from "../../lib/supabase";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { data, error } = await supabase.auth.signInWithPassword({
      email: email,
      password: password,
    });

    if (error) {
      setError("Sai email hoặc mật khẩu! Vui lòng thử lại.");
      setLoading(false);
    } else {
      // Đăng nhập thành công, tự động mở cửa vào Dashboard
      window.location.href = "/dashboard";
    }
  };

  return (
    <div className="min-h-screen bg-[#FDFBF7] flex flex-col items-center justify-center p-4">
      <div className="max-w-md w-full bg-white p-8 rounded-3xl shadow-xl border-2 border-[#E5C158]">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-[#9B1B1B] mb-2" style={{ fontFamily: "'Playfair Display', serif" }}>WeddingClick</h1>
          <p className="text-sm text-gray-500 uppercase tracking-widest font-bold">Hệ thống Quản trị</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">Tên đăng nhập (Email)</label>
            <input 
              type="email" 
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full border-2 border-gray-200 p-3 rounded-xl focus:border-[#9B1B1B] focus:outline-none transition"
              placeholder="admin@weddingclick.online"
            />
          </div>
          
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">Mật khẩu</label>
            <input 
              type="password" 
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full border-2 border-gray-200 p-3 rounded-xl focus:border-[#9B1B1B] focus:outline-none transition"
              placeholder="••••••••"
            />
          </div>

          {error && <p className="text-red-500 text-sm text-center font-semibold bg-red-50 p-2 rounded">{error}</p>}

          <button 
            type="submit" 
            disabled={loading}
            className="w-full bg-[#9B1B1B] text-white font-bold py-4 rounded-xl hover:bg-red-800 transition shadow-lg mt-4"
          >
            {loading ? "Đang mở khóa..." : "Đăng Nhập"}
          </button>
        </form>
      </div>
    </div>
  );
}