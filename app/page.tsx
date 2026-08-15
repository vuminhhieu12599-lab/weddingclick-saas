import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#FDFBF7] font-sans text-gray-800 selection:bg-[#E5C158] selection:text-[#9B1B1B] overflow-x-hidden">
      
      {/* 1. NAVBAR - THANH ĐIỀU HƯỚNG */}
      <nav className="fixed w-full bg-white/90 backdrop-blur-md z-50 border-b border-[#E5C158]/30 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          {/* Logo */}
          <div className="text-2xl font-bold text-[#9B1B1B] flex items-center gap-2" style={{ fontFamily: "'Playfair Display', serif" }}>
            <span>WeddingClick</span>
            <span className="w-2 h-2 rounded-full bg-[#E5C158] animate-pulse"></span>
          </div>
          
          {/* Menu ẩn trên Mobile */}
          <div className="hidden md:flex gap-8 font-semibold text-sm text-gray-600 uppercase tracking-wider">
            <a href="#templates" className="hover:text-[#9B1B1B] transition">Kho Mẫu</a>
            <a href="#features" className="hover:text-[#9B1B1B] transition">Tính năng</a>
            <a href="#contact" className="hover:text-[#9B1B1B] transition">Liên hệ</a>
          </div>

          {/* Nút Quản trị (Thay thế nút Tạo thiệp) */}
          <Link href="/login" className="bg-gray-100 text-gray-500 px-5 py-2 rounded-full text-sm font-bold shadow-sm hover:bg-gray-200 transition-all duration-200 flex items-center gap-2 border border-gray-200">
            <span className="text-xs">🔒</span> <span className="hidden sm:inline">Quản trị</span>
          </Link>
        </div>
      </nav>

      {/* 2. KHU VỰC CHÍNH (ĐƯA KHO MẪU LÊN ĐẦU) */}
      <section id="templates" className="pt-32 pb-16 px-4 relative">
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-[#E5C158]/10 rounded-full blur-3xl -z-10"></div>
        
        <div className="max-w-7xl mx-auto">
          {/* Tiêu đề trang */}
          <div className="text-center mb-10">
            <h1 className="text-4xl md:text-6xl font-bold text-gray-900 mb-4" style={{ fontFamily: "'Playfair Display', serif" }}>
              Gửi yêu thương trong <span className="text-[#9B1B1B] italic">một click</span>
            </h1>
            <p className="text-gray-600 text-lg max-w-2xl mx-auto">
              Lựa chọn ngay một giao diện bên dưới để bắt đầu câu chuyện tình yêu của bạn.
            </p>
          </div>

          {/* THÔNG BÁO GIÁ & GÓI VIP (Bố trí nổi bật, tinh tế) */}
          <div className="max-w-3xl mx-auto bg-white border-2 border-[#E5C158]/60 p-5 rounded-2xl mb-12 shadow-[0_10px_30px_rgba(229,193,88,0.15)] transform hover:scale-[1.02] transition-transform">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4">
              <div className="text-center md:text-left">
                <span className="bg-red-50 text-[#9B1B1B] text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider mb-2 inline-block">Đề xuất</span>
                <p className="font-bold text-gray-800">Nâng cấp Gói V.I.P (Chỉ thêm 100.000đ)</p>
                <p className="text-sm text-gray-500 mt-1">Sở hữu công cụ tự tạo vô hạn link thiệp có <strong className="text-[#9B1B1B]">in tên đích danh</strong> từng khách mời (Kính mời Chú A, Bạn B...)</p>
              </div>
              <a href="#contact" className="shrink-0 bg-[#9B1B1B] text-white px-6 py-2.5 rounded-xl text-sm font-bold hover:bg-red-800 transition shadow-md whitespace-nowrap">
                Tư vấn Gói VIP
              </a>
            </div>
          </div>

          {/* LƯỚI GIAO DIỆN */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {/* Mẫu 1 */}
            <div className="bg-white rounded-3xl overflow-hidden shadow-lg border border-gray-100 group relative flex flex-col">
              <div className="h-[450px] overflow-hidden relative">
                <img src="https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&w=600&q=80" alt="Truyền thống" className="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-700" />
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col justify-end items-center pb-10">
                  <a href="/test-thiep-01" target="_blank" className="bg-[#E5C158] text-[#9B1B1B] px-8 py-3 rounded-full font-bold shadow-2xl transform translate-y-10 group-hover:translate-y-0 transition-all duration-500">👁️ Xem Bản Demo</a>
                </div>
              </div>
              <div className="absolute top-4 left-4 bg-white/95 backdrop-blur px-3 py-1 rounded-full text-xs font-bold text-[#9B1B1B] shadow-sm flex items-center gap-1">
                <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span> Bán Chạy Nhất
              </div>
              <div className="p-6 text-center border-t border-gray-50 flex flex-col items-center flex-grow">
                <h3 className="text-xl font-bold text-gray-900">Truyền Thống (Đỏ)</h3>
                <p className="text-sm text-gray-500 mt-1 mb-4">Sang trọng, Ấm cúng, Đậm bản sắc</p>
                <div className="mt-auto bg-gray-50 px-6 py-2 rounded-xl border border-gray-100">
                  <span className="text-2xl font-bold text-[#9B1B1B]">150.000đ</span>
                </div>
              </div>
            </div>

            {/* Mẫu 2 */}
            <div className="bg-white rounded-3xl overflow-hidden shadow-lg border border-gray-100 group flex flex-col">
              <div className="h-[450px] overflow-hidden relative">
                <img src="https://images.unsplash.com/photo-1606800052052-a08af7148866?auto=format&fit=crop&w=600&q=80" alt="Hiện đại" className="w-full h-full object-cover grayscale-[20%] group-hover:grayscale-0 transition-all duration-700" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="bg-white text-gray-800 px-6 py-3 rounded-full font-bold shadow-lg">Sắp ra mắt</span>
                </div>
              </div>
              <div className="p-6 text-center border-t border-gray-50 flex flex-col items-center flex-grow">
                <h3 className="text-xl font-bold text-gray-900">Hiện Đại Tối Giản</h3>
                <p className="text-sm text-gray-500 mt-1 mb-4">Thanh lịch, Chuẩn phong cách Tây Âu</p>
                <div className="mt-auto bg-gray-50 px-6 py-2 rounded-xl border border-gray-100">
                  <span className="text-2xl font-bold text-[#9B1B1B]">150.000đ</span>
                </div>
              </div>
            </div>

            {/* Mẫu 3 */}
            <div className="bg-white rounded-3xl overflow-hidden shadow-lg border border-gray-100 group flex flex-col">
              <div className="h-[450px] overflow-hidden relative bg-gray-50 flex items-center justify-center">
                <div className="text-center text-gray-400">
                  <div className="text-4xl mb-2">✨</div>
                  <p className="font-medium text-sm px-8">Đang thiết kế thêm mẫu mới cho mùa cưới 2026</p>
                </div>
              </div>
              <div className="p-6 text-center border-t border-gray-50 flex flex-col items-center flex-grow">
                <h3 className="text-xl font-bold text-gray-900">Bảo Tàng Kỷ Niệm</h3>
                <p className="text-sm text-gray-500 mt-1 mb-4">Giao diện ngang cuộn mượt mà</p>
                <div className="mt-auto bg-gray-50 px-6 py-2 rounded-xl border border-gray-100">
                  <span className="text-2xl font-bold text-[#9B1B1B]">150.000đ</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. TÍNH NĂNG NỔI BẬT (Sau khi khách đã xem mẫu và giá) */}
      <section id="features" className="py-20 bg-white px-4 border-t border-gray-100">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-gray-900" style={{ fontFamily: "'Playfair Display', serif" }}>Mọi tính năng trong một mức giá</h2>
            <p className="text-gray-500 mt-3">Không phát sinh chi phí, trọn vẹn trải nghiệm</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { icon: "🖼️", title: "Album Ảnh Cưới", desc: "Tải lên thư viện ảnh cưới sắc nét, hiệu ứng lướt xem mượt mà." },
              { icon: "📊", title: "Quản Lý RSVP", desc: "Khách xác nhận tham dự dễ dàng. Thống kê tự động cỗ báo." },
              { icon: "🎁", title: "Mừng Cưới Tinh Tế", desc: "Tích hợp mã QR Ngân hàng ngay trên thiệp để khách gửi quà." },
              { icon: "🌸", title: "Hiệu Ứng Lãng Mạn", desc: "Tự phát nhạc nền, kèm hiệu ứng hoa rơi tuyệt đẹp." }
            ].map((feature, idx) => (
              <div key={idx} className="bg-[#FDFBF7] p-6 rounded-2xl border border-gray-100 hover:border-[#E5C158]/50 transition-colors">
                <div className="text-3xl mb-4">{feature.icon}</div>
                <h3 className="text-base font-bold text-[#9B1B1B] mb-2">{feature.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4. CALL TO ACTION - CHỐT SALE */}
      <section id="contact" className="py-24 px-4 bg-[#FDFBF7] text-center border-t border-gray-100">
        <div className="max-w-3xl mx-auto bg-white p-10 md:p-14 rounded-[2.5rem] shadow-xl border border-[#E5C158]/20 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-[#9B1B1B] to-[#E5C158]"></div>
          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4" style={{ fontFamily: "'Playfair Display', serif" }}>Tạo bất ngờ cho khách mời của bạn!</h2>
          <p className="text-gray-600 mb-10 font-medium text-lg">Liên hệ ngay để nhận link trải nghiệm thực tế và tư vấn hoàn toàn miễn phí.</p>
          
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <a href="https://zalo.me/sodienthoaicuaban" target="_blank" rel="noreferrer" className="bg-[#0068FF] text-white px-8 py-4 rounded-full font-bold shadow-[0_8px_20px_rgba(0,104,255,0.3)] hover:bg-blue-700 transition hover:-translate-y-1 flex items-center justify-center gap-2">
              <span className="text-xl">💬</span> Chat Zalo Tư Vấn
            </a>
            <a href="tel:sodienthoaicuaban" className="bg-[#10C172] text-white px-8 py-4 rounded-full font-bold shadow-[0_8px_20px_rgba(16,193,114,0.3)] hover:bg-green-600 transition hover:-translate-y-1 flex items-center justify-center gap-2">
              <span className="text-xl">📞</span> Gọi Hotline Cskh
            </a>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-white py-8 border-t border-gray-100 text-center text-gray-400 text-sm">
        <div className="max-w-7xl mx-auto px-4 flex flex-col md:flex-row justify-between items-center">
          <p>© 2026 WeddingClick. Gửi yêu thương trong một click.</p>
          <div className="mt-4 md:mt-0 flex gap-4">
            <span className="hover:text-gray-600 cursor-pointer transition">Hỗ trợ 24/7</span>
            <span className="hover:text-gray-600 cursor-pointer transition">Bảo mật dữ liệu</span>
          </div>
        </div>
      </footer>
      
    </div>
  );
}