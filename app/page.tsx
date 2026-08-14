import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#FDFBF7] font-sans text-gray-800 selection:bg-[#E5C158] selection:text-[#9B1B1B] overflow-x-hidden">
      
      {/* 1. NAVBAR - THANH ĐIỀU HƯỚNG */}
      <nav className="fixed w-full bg-white/90 backdrop-blur-md z-50 border-b border-[#E5C158]/30 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="text-2xl font-bold text-[#9B1B1B] flex items-center gap-2" style={{ fontFamily: "'Playfair Display', serif" }}>
            <span>WeddingClick</span>
            <span className="w-2 h-2 rounded-full bg-[#E5C158] animate-pulse"></span>
          </div>
          <div className="hidden md:flex gap-8 font-semibold text-sm text-gray-600 uppercase tracking-wider">
            <a href="#features" className="hover:text-[#9B1B1B] transition">Tính năng</a>
            <a href="#templates" className="hover:text-[#9B1B1B] transition">Kho Mẫu</a>
            <a href="#pricing" className="hover:text-[#9B1B1B] transition">Bảng giá</a>
          </div>
          <a href="#templates" className="bg-[#9B1B1B] text-white px-6 py-2 rounded-full text-sm font-bold shadow-[0_4px_14px_0_rgba(155,27,27,0.39)] hover:shadow-[0_6px_20px_rgba(155,27,27,0.23)] hover:-translate-y-0.5 transition-all duration-200">
            Tạo Thiệp Ngay
          </a>
        </div>
      </nav>

      {/* 2. HERO SECTION - HIỆU ỨNG NỔI 3D */}
      <section className="pt-36 pb-20 px-4 relative">
        {/* Vòng tròn trang trí mờ phía sau */}
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[600px] h-[600px] bg-[#E5C158]/10 rounded-full blur-3xl -z-10"></div>
        
        <div className="max-w-5xl mx-auto text-center relative z-10">
          <h2 className="text-[#E5C158] font-bold tracking-[0.2em] uppercase text-sm mb-4 animate-fade-in-up">WeddingClick</h2>
          <h1 className="text-5xl md:text-7xl font-bold text-gray-900 mb-6 leading-tight drop-shadow-sm" style={{ fontFamily: "'Playfair Display', serif" }}>
            Gửi yêu thương trong <br /> <span className="text-[#9B1B1B] italic relative inline-block hover:scale-105 transition-transform duration-300">một click <span className="absolute -bottom-2 left-0 w-full h-1 bg-[#E5C158] rounded-full"></span></span>
          </h1>
          <p className="text-gray-600 text-lg md:text-xl mb-10 max-w-2xl mx-auto leading-relaxed">
            Thay lời mời truyền thống bằng trải nghiệm số hóa tinh tế. Tích hợp thiệp in tên đích danh, tự động phát nhạc, đếm ngược và quản lý khách mời hoàn toàn tự động.
          </p>
          
          <div className="flex flex-col sm:flex-row justify-center gap-5">
            <a href="#templates" className="bg-[#9B1B1B] text-white px-8 py-4 rounded-full font-bold shadow-[0_10px_20px_rgba(155,27,27,0.2)] hover:bg-red-800 transition-all duration-300 hover:-translate-y-1">
              Khám Phá Kho Mẫu
            </a>
            <a href="#contact" className="bg-white border-2 border-[#E5C158] text-[#9B1B1B] px-8 py-4 rounded-full font-bold shadow-lg hover:shadow-xl hover:-translate-y-1 transition-all duration-300">
              Nhận Tư Vấn Miễn Phí
            </a>
          </div>
        </div>

        {/* Khối giao diện giả lập 3D (Mockup) lơ lửng */}
        <div className="max-w-4xl mx-auto mt-16 relative perspective-1000">
          <div className="bg-white p-2 rounded-3xl shadow-2xl transform rotate-x-12 hover:rotate-x-0 transition-transform duration-700 border border-gray-100 relative group">
            <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent rounded-3xl opacity-0 group-hover:opacity-100 transition-opacity"></div>
            <img src="https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=1200&q=80" alt="Giao diện thiệp cưới" className="w-full h-[400px] object-cover rounded-2xl" />
          </div>
        </div>
      </section>

      {/* 3. TÍNH NĂNG NỔI BẬT (DẠNG THẺ NỔI) */}
      <section id="features" className="py-24 bg-white px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900" style={{ fontFamily: "'Playfair Display', serif" }}>Tinh Tế Từng Chi Tiết</h2>
            <div className="w-20 h-1 bg-[#E5C158] mx-auto mt-6 rounded-full"></div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { icon: "💎", title: "Thiệp VIP Đích Danh", desc: "Mỗi khách mời nhận một link riêng có in tên trang trọng (Ví dụ: Kính mời Chú Nam)." },
              { icon: "📊", title: "Quản Lý RSVP", desc: "Khách xác nhận tham dự dễ dàng. Tự động thống kê số lượng cỗ báo về điện thoại." },
              { icon: "🎁", title: "Mừng Cưới Tinh Tế", desc: "Tích hợp mã QR Bank ngay trên thiệp, giúp khách mời ở xa gửi quà thuận tiện." },
              { icon: "🌸", title: "Hiệu Ứng Lãng Mạn", desc: "Trang bị nhạc nền tự phát, hiệu ứng hoa rơi và album ảnh cưới chất lượng cao." }
            ].map((feature, idx) => (
              <div key={idx} className="bg-[#FDFBF7] p-8 rounded-3xl border border-gray-100 transition-all duration-300 hover:-translate-y-2 hover:shadow-[0_20px_40px_-15px_rgba(155,27,27,0.1)] group">
                <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center text-3xl mb-6 border border-[#E5C158]/30 group-hover:rotate-12 transition-transform">{feature.icon}</div>
                <h3 className="text-lg font-bold text-[#9B1B1B] mb-3">{feature.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4. KHO GIAO DIỆN (TEMPLATES) */}
      <section id="templates" className="py-24 bg-[#FDFBF7] px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900" style={{ fontFamily: "'Playfair Display', serif" }}>Kho Giao Diện Tuyệt Đẹp</h2>
            <p className="text-gray-500 mt-4 font-medium">Lựa chọn phong cách kể câu chuyện của riêng bạn</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-10">
            {/* Mẫu 1 */}
            <div className="bg-white rounded-3xl overflow-hidden shadow-lg border border-gray-100 group relative">
              <div className="h-[450px] overflow-hidden relative">
                <img src="https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&w=600&q=80" alt="Truyền thống" className="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-700" />
                <div className="absolute inset-0 bg-gradient-to-t from-[#9B1B1B]/90 via-[#9B1B1B]/40 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-300 flex flex-col justify-end items-center pb-10">
                  <a href="/test-thiep-01" target="_blank" className="bg-[#E5C158] text-[#9B1B1B] px-8 py-3 rounded-full font-bold shadow-2xl transform translate-y-10 group-hover:translate-y-0 transition-all duration-500">👁️ Xem Bản Demo</a>
                </div>
              </div>
              <div className="absolute top-4 left-4 bg-white/90 backdrop-blur px-3 py-1 rounded-full text-xs font-bold text-[#9B1B1B] shadow-sm">Bán Chạy Nhất</div>
              <div className="p-6 text-center border-t border-gray-50">
                <h3 className="text-xl font-bold text-gray-900">Truyền Thống (Đỏ)</h3>
                <p className="text-sm text-gray-500 mt-1">Sang trọng, Ấm cúng, Đậm bản sắc</p>
              </div>
            </div>

            {/* Mẫu 2 */}
            <div className="bg-white rounded-3xl overflow-hidden shadow-lg border border-gray-100 group">
              <div className="h-[450px] overflow-hidden relative">
                <img src="https://images.unsplash.com/photo-1606800052052-a08af7148866?auto=format&fit=crop&w=600&q=80" alt="Hiện đại" className="w-full h-full object-cover grayscale-[30%] group-hover:grayscale-0 transition-all duration-700" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                  <span className="bg-white text-gray-800 px-6 py-3 rounded-full font-bold shadow-lg">Sắp ra mắt</span>
                </div>
              </div>
              <div className="p-6 text-center border-t border-gray-50">
                <h3 className="text-xl font-bold text-gray-900">Hiện Đại Tối Giản</h3>
                <p className="text-sm text-gray-500 mt-1">Thanh lịch, Chuẩn phong cách Tây Âu</p>
              </div>
            </div>

            {/* Mẫu 3 */}
            <div className="bg-white rounded-3xl overflow-hidden shadow-lg border border-gray-100 group">
              <div className="h-[450px] overflow-hidden relative bg-gray-100 flex items-center justify-center">
                <div className="text-center text-gray-400">
                  <div className="text-4xl mb-2">✨</div>
                  <p className="font-medium">Đang cập nhật thêm mẫu mới</p>
                </div>
              </div>
              <div className="p-6 text-center border-t border-gray-50">
                <h3 className="text-xl font-bold text-gray-900">Bảo Tàng Kỷ Niệm</h3>
                <p className="text-sm text-gray-500 mt-1">Giao diện ngang cuộn mượt mà</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. BẢNG GIÁ - TẠO SỰ TƯƠNG PHẢN */}
      <section id="pricing" className="py-24 bg-white px-4 border-t border-gray-100">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-[#9B1B1B]" style={{ fontFamily: "'Playfair Display', serif" }}>Chi Phí Tối Ưu Nhất</h2>
            <p className="text-gray-500 mt-4">Chỉ thanh toán 1 lần, sử dụng trọn đời đến khi cưới xong</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Gói Cơ Bản */}
            <div className="bg-white p-10 rounded-3xl border border-gray-200 shadow-sm hover:shadow-md transition">
              <h3 className="text-2xl font-bold text-gray-800 mb-2">Gói Tiêu Chuẩn</h3>
              <div className="text-4xl font-bold text-[#9B1B1B] mb-8">199.000đ</div>
              <ul className="space-y-4 mb-10 text-gray-600 font-medium text-sm">
                <li className="flex gap-3"><span className="text-green-500">✔️</span> Tùy chọn kho mẫu giao diện cao cấp</li>
                <li className="flex gap-3"><span className="text-green-500">✔️</span> Album ảnh cưới sắc nét (Tối đa 30 ảnh)</li>
                <li className="flex gap-3"><span className="text-green-500">✔️</span> Form xác nhận tham dự & Quản lý RSVP</li>
                <li className="flex gap-3"><span className="text-green-500">✔️</span> Mã QR Bank Mừng cưới tự động</li>
                <li className="flex gap-3 opacity-50"><span className="text-red-400">❌</span> Không hỗ trợ công cụ sinh Link VIP in tên riêng</li>
              </ul>
              <a href="#contact" className="block text-center w-full bg-gray-100 text-gray-800 font-bold py-4 rounded-xl hover:bg-gray-200 transition">Đăng Ký Ngay</a>
            </div>

            {/* Gói VIP (Hiệu ứng nổi bật) */}
            <div className="bg-[#9B1B1B] p-10 rounded-3xl border-2 border-[#E5C158] relative transform md:-translate-y-6 shadow-2xl text-white">
              <div className="absolute top-0 right-10 bg-[#E5C158] text-[#9B1B1B] font-bold px-5 py-1.5 rounded-b-xl text-sm shadow-md">KHUYÊN DÙNG</div>
              <h3 className="text-2xl font-bold text-[#E5C158] mb-2">Gói V.I.P</h3>
              <div className="text-4xl font-bold text-white mb-8">299.000đ</div>
              <ul className="space-y-4 mb-10 text-red-50 font-medium text-sm">
                <li className="flex gap-3"><span className="text-[#E5C158]">✔️</span> <strong>Toàn bộ tính năng của Gói Tiêu Chuẩn</strong></li>
                <li className="flex gap-3"><span className="text-[#E5C158]">✔️</span> <strong>Công cụ VIP:</strong> Sinh vô hạn Link Thiệp Đích Danh có in tên khách mời (Kính mời Chú A, Bạn B...)</li>
                <li className="flex gap-3"><span className="text-[#E5C158]">✔️</span> Kích hoạt hiệu ứng hoa rơi lãng mạn</li>
                <li className="flex gap-3"><span className="text-[#E5C158]">✔️</span> Hỗ trợ tùy chỉnh nhạc nền theo yêu cầu</li>
              </ul>
              <a href="#contact" className="block text-center w-full bg-[#E5C158] text-[#9B1B1B] font-bold py-4 rounded-xl hover:bg-yellow-500 transition shadow-[0_4px_14px_0_rgba(229,193,88,0.39)] uppercase tracking-wider">Đăng Ký Gói VIP</a>
            </div>
          </div>
        </div>
      </section>

      {/* 6. CALL TO ACTION - CHỐT SALE */}
      <section id="contact" className="py-24 px-4 bg-[#FDFBF7] text-center">
        <div className="max-w-3xl mx-auto bg-white p-12 rounded-[3rem] shadow-xl border border-[#E5C158]/20 relative overflow-hidden">
          <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-[#9B1B1B] to-[#E5C158]"></div>
          <h2 className="text-3xl font-bold text-gray-900 mb-4" style={{ fontFamily: "'Playfair Display', serif" }}>Bạn đã sẵn sàng tạo bất ngờ cho khách mời?</h2>
          <p className="text-gray-600 mb-10 font-medium">Nhắn tin ngay cho chúng tôi để nhận đường link trải nghiệm thực tế và tư vấn hoàn toàn miễn phí.</p>
          
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <a href="https://zalo.me/sodienthoaicuaban" target="_blank" rel="noreferrer" className="bg-[#0068FF] text-white px-8 py-4 rounded-full font-bold shadow-lg hover:bg-blue-700 transition hover:-translate-y-1 flex items-center justify-center gap-2">
              <span className="text-xl">💬</span> Nhắn Tin Zalo Ngay
            </a>
            <a href="tel:sodienthoaicuaban" className="bg-[#10C172] text-white px-8 py-4 rounded-full font-bold shadow-lg hover:bg-green-600 transition hover:-translate-y-1 flex items-center justify-center gap-2">
              <span className="text-xl">📞</span> Gọi Hotline: 09xx.xxx.xxx
            </a>
          </div>
        </div>
      </section>

      {/* FOOTER & NÚT ĐĂNG NHẬP BÍ MẬT DÀNH CHO BẠN */}
      <footer className="bg-white py-8 border-t border-gray-100 text-center text-gray-400 text-sm relative">
        <div className="max-w-6xl mx-auto px-4 flex flex-col md:flex-row justify-between items-center">
          <p>© 2026 WeddingClick. Gửi yêu thương trong một click.</p>
          <div className="mt-4 md:mt-0 flex gap-4">
            <a href="#" className="hover:text-[#9B1B1B] transition">Điều khoản</a>
            <a href="#" className="hover:text-[#9B1B1B] transition">Bảo mật</a>
          </div>
        </div>
        
        {/* NÚT VÀO TRANG QUẢN TRỊ ADMIN (Khóa bảo mật) */}
        <Link href="/login" className="absolute bottom-6 right-6 text-gray-200 hover:text-[#9B1B1B] transition" title="Đăng nhập hệ thống">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
          </svg>
        </Link>
      </footer>
      
    </div>
  );
}