import Link from "next/link";

export default function Home() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#FDFBF7]">
      <h1 className="text-5xl font-bold text-[#9B1B1B] mb-4" style={{ fontFamily: "'Playfair Display', serif" }}>
        WeddingClick
      </h1>
      <p className="text-gray-600 mb-8 tracking-widest uppercase text-sm">
        Chỉ một chạm - Trọn vẹn niềm vui
      </p>
      
      <Link href="/dashboard">
        <button className="bg-[#9B1B1B] text-white px-8 py-4 rounded-full font-bold hover:bg-red-800 transition shadow-xl uppercase tracking-wider text-sm">
          🚀 Vào Trang Quản Lý
        </button>
      </Link>
    </div>
  );
}