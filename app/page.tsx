import Link from "next/link";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#FDFBF7] font-sans text-gray-800 selection:bg-[#E5C158] selection:text-[#9B1B1B]">
      
      {/* 1. NAVBAR (THANH ĐIỀU HƯỚNG) */}
      <nav className="fixed w-full bg-white/90 backdrop-blur-md z-50 border-b border-[#E5C158]/30 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-4 flex justify-between items-center">
          <div className="text-2xl font-bold text-[#9B1B1B]" style={{ fontFamily: "'Playfair Display', serif" }}>
            WeddingClick
          </div>
          <div className="hidden md:flex gap-8 font-semibold text-sm text-gray-600 uppercase tracking-wider">
            <a href="#features" className="hover:text-[#9B1B1B] transition">Tính năng</a>
            <a href="#templates" className="hover:text-[#9B1B1B] transition">Kho Mẫu</a>
            <a href="#pricing" className="hover:text-[#9B1B1B] transition">Bảng giá</a>
          </div>
          <a href="#contact" className="bg-[#9B1B1B] text-white px-5 py-2 rounded-full text-sm font-bold shadow-md hover:bg-red-800 transition">
            Tạo Thiệp Ngay
          </a>
        </div>
      </nav>

      {/* 2. HERO SECTION (MẶT TIỀN) */}
      <section className="pt-32 pb-20 px-4 text-center">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-[#E5C158] font-bold tracking-[0.2em] uppercase text-sm mb-4">Chỉ một chạm - Trọn vẹn niềm vui</h2>
          <h1 className="text-5xl md:text-7xl font-bold text-gray-900 mb-6 leading-tight" style={{ fontFamily: "'Playfair Display', serif" }}>
            Thiệp Cưới Thông Minh <br /> <span className="text-[#9B1B1B] italic">Đậm Chất Riêng</span>
          </h1>
          <p className="text-gray-600 text-lg md:text-xl mb-10 max-w-2xl mx-auto leading-relaxed">
            Thay lời mời truyền thống bằng trải nghiệm số hóa tuyệt đẹp. Gửi gắm trọn vẹn cảm xúc, âm nhạc và lưu giữ mọi lời chúc của khách mời chỉ qua một đường link.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <a href="#templates" className="bg-[#9B1B1B] text-white px-8 py-4 rounded-full font-bold shadow-lg hover:bg-red-800 transition hover:-translate-y-1">
              Khám Phá Kho Mẫu
            </a>
            <a href="#contact" className="bg-white border-2 border-[#E5C158] text-[#9B1B1B] px-8 py-4 rounded-full font-bold shadow-sm hover:bg-[#FDFBF7] transition">
              Nhận Tư Vấn Miễn Phí
            </a>
          </div>
        </div>
      </section>

      {/* 3. TÍNH NĂNG NỔI BẬT */}
      <section id="features" className="py-20 bg-white border-y border-gray-100 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900" style={{ fontFamily: "'Playfair Display', serif" }}>Trải Nghiệm Cưới Đỉnh Cao</h2>
            <div className="w-24 h-1 bg-[#E5C158] mx-auto mt-6"></div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {[
              { icon: "💎", title: "Thiệp VIP Đích Danh", desc: "Đẳng cấp và tôn trọng. Mỗi khách mời sẽ nhận được một đường link với tên riêng được in trang trọng trên thiệp." },
              { icon: "📊", title: "Quản Lý RSVP Tự Động", desc: "Khách mời dễ dàng xác nhận tham dự và gửi lời chúc. Dữ liệu được thống kê tự động giúp bạn kiểm soát cỗ bàn chính xác." },
              { icon: "🎁", title: "Mừng Cưới Tinh Tế", desc: "Tích hợp sẵn mã QR Ngân hàng trên thiệp, giúp khách mời ở xa dễ dàng gửi gắm tâm giao một cách tế nhị nhất." },
              { icon: "🌸", title: "Hiệu Ứng & Âm Nhạc", desc: "Chạm để mở thiệp cùng bản nhạc nền yêu thích, kết hợp hiệu ứng cánh hoa rơi, thả tim album cưới cực kỳ lãng mạn." }
            ].map((feature, idx) => (
              <div key={idx} className="bg-[#FDFBF7] p-8 rounded-2xl border border-gray-100 hover:border-[#E5C158] transition group hover:shadow-xl">
                <div className="text-4xl mb-4 group-hover:scale-110 transition-transform">{feature.icon}</div>
                <h3 className="text-xl font-bold text-[#9B1B1B] mb-3">{feature.title}</h3>
                <p className="text-gray-600 text-sm leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 4. KHO GIAO DIỆN (TEMPLATES) */}
      <section id="templates" className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-gray-900" style={{ fontFamily: "'Playfair Display', serif" }}>Kho Giao Diện Tuyệt Đẹp</h2>
            <p className="text-gray-500 mt-4">Chọn một phong cách kể câu chuyện tình yêu của riêng bạn</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Template 1 */}
            <div className="bg-white rounded-2xl overflow-hidden shadow-lg border border-gray-100 group">
              <div className="h-[400px] overflow-hidden relative">
                <img src="https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=600&q=80" alt="Truyền thống" className="w-full h-full object-cover group-hover:scale-105 transition duration-700" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                  <a href="/test-thiep-01" target="_blank" className="bg-[#E5C158] text-[#9B1B1B] px-6 py-3 rounded-full font-bold shadow-lg hover:scale-105 transition">👁️ Xem Bản Demo</a>
                </div>
              </div>
              <div className="p-6 text-center">
                <h3 className="text-xl font-bold text-gray-900">Truyền Thống (Đỏ)</h3>
                <p className="text-sm text-gray-500 mt-1">Sang trọng, Ấm cúng, Đậm bản sắc</p>
              </div>
            </div>

            {/* Template 2 */}
            <div className="bg-white rounded-2xl overflow-hidden shadow-lg border border-gray-100 group">
              <div className="h-[400px] overflow-hidden relative">
                <img src="https://images.unsplash.com/photo-1511285560929-80b456fea0bc?auto=format&fit=crop&w=600&q=80" alt="Hiện đại" className="w-full h-full object-cover group-hover:scale-105 transition duration-700" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                  <span className="bg-white text-gray-800 px-6 py-3 rounded-full font-bold shadow-lg">Đang cập nhật...</span>
                </div>
              </div>
              <div className="p-6 text-center">
                <h3 className="text-xl font-bold text-gray-900">Hiện Đại Cổ Tích</h3>
                <p className="text-sm text-gray-500 mt-1">Lãng mạn, Tinh tế, Nhẹ nhàng</p>
              </div>
            </div>

            {/* Template 3 */}
            <div className="bg-white rounded-2xl overflow-hidden shadow-lg border border-gray-100 group">
              <div className="h-[400px] overflow-hidden relative">
                <img src="https://images.unsplash.com/photo-1606800052052-a08af7148866?auto=format&fit=crop&w=600&q=80" alt="Thanh lịch" className="w-full h-full object-cover group-hover:scale-105 transition duration-700" />
                <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center backdrop-blur-sm">
                  <span className="bg-white text-gray-800 px-6 py-3 rounded-full font-bold shadow-lg">Đang cập nhật...</span>
                </div>
              </div>
              <div className="p-6 text-center">
                <h3 className="text-xl font-bold text-gray-900">Thanh Lịch (Tối giản)</h3>
                <p className="text-sm text-gray-500 mt-1">Hiện đại, Phong cách Tây Âu</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 5. BẢNG GIÁ */}
      <section id="pricing" className="py-20 bg-gray-900 text-white px-4">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-3xl md:text-4xl font-bold text-[#E5C158]" style={{ fontFamily: "'Playfair Display', serif" }}>Bảng Giá Dịch Vụ</h2>
            <p className="text-gray-400 mt-4">Chi phí nhỏ, giá trị tinh thần to lớn</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {/* Gói Cơ Bản */}
            <div className="bg-gray-800 p-8 rounded-3xl border border-gray-700">
              <h3 className="text-2xl font-bold mb-2">Gói Tiêu Chuẩn</h3>
              <div className="text-4xl font-bold text-white mb-6">199.000đ</div>
              <ul className="space-y-4 mb-8 text-gray-300">
                <li className="flex gap-3"><span>✔️</span> Chọn 1 mẫu giao diện có sẵn</li>
                <li className="flex gap-3"><span>✔️</span> Tải lên Album ảnh cưới giới hạn 20 ảnh</li>
                <li className="flex gap-3"><span>✔️</span> Tích hợp nhạc nền & Đếm ngược</li>
                <li className="flex gap-3"><span>✔️</span> Form xác nhận tham dự (RSVP) & Thống kê</li>
                <li className="flex gap-3"><span>✔️</span> Mã QR Mừng cưới</li>
                <li className="flex gap-3 opacity-50"><span>❌</span> Thiệp chung (Không có tên riêng khách mời)</li>
              </ul>
            </div>

            {/* Gói VIP */}
            <div className="bg-gradient-to-b from-[#9B1B1B] to-red-900 p-8 rounded-3xl border-2 border-[#E5C158] relative transform md:-translate-y-4 shadow-2xl">
              <div className="absolute top-0 right-8 bg-[#E5C158] text-[#9B1B1B] font-bold px-4 py-1 rounded-b-lg text-sm">KHUYÊN DÙNG</div>
              <h3 className="text-2xl font-bold mb-2 text-[#E5C158]">Gói V.I.P</h3>
              <div className="text-4xl font-bold text-white mb-6">299.000đ</div>
              <ul className="space-y-4 mb-8 text-red-100">
                <li className="flex gap-3"><span>✔️</span> <strong>Mọi tính năng của gói Tiêu Chuẩn</strong></li>
                <li className="flex gap-3"><span>✔️</span> <strong>Công cụ VIP:</strong> Tự tạo vô hạn Link thiệp có in tên Đích Danh từng khách mời (VD: Kính mời Chú Nam, Kính mời Bạn Hoa...)</li>
                <li className="flex gap-3"><span>✔️</span> Nâng cấp hiệu ứng trái tim rơi cao cấp</li>
                <li className="flex gap-3"><span>✔️</span> Hỗ trợ tùy chỉnh ảnh chất lượng cao</li>
              </ul>
              <a href="#contact" className="block text-center w-full bg-[#E5C158] text-[#9B1B1B] font-bold py-4 rounded-xl hover:bg-yellow-400 transition shadow-lg uppercase tracking-wider">
                Đăng Ký Gói VIP
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* 6. LIÊN HỆ CHỐT SALE */}
      <section id="contact" className="py-24 px-4 bg-white text-center border-b border-gray-100">
        <div className="max-w-2xl mx-auto">
          <h2 className="text-3xl font-bold text-gray-900 mb-6" style={{ fontFamily: "'Playfair Display', serif" }}>Bắt đầu tạo thiệp cưới của bạn!</h2>
          <p className="text-gray-600 mb-10">Liên hệ ngay để nhận tư vấn và kích hoạt tài khoản sử dụng trọn đời (cho đến ngày cưới).</p>
          
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <a href="https://zalo.me/0967693256" target="_blank" rel="noreferrer" className="bg-blue-500 text-white px-8 py-4 rounded-full font-bold shadow-lg hover:bg-blue-600 transition flex items-center justify-center gap-2">
              <span className="text-xl">💬</span> Chat Zalo Tư Vấn
            </a>
            <a href="tel:0967693256" className="bg-green-500 text-white px-8 py-4 rounded-full font-bold shadow-lg hover:bg-green-600 transition flex items-center justify-center gap-2">
              <span className="text-xl">📞</span> Gọi Hotline Cskh
            </a>
          </div>
        </div>
      </section>

      {/* FOOTER & NÚT BÍ MẬT */}
      <footer className="bg-[#FDFBF7] py-8 text-center text-gray-500 text-sm relative">
        <p>© 2026 WeddingClick. Cùng bạn kiến tạo hạnh phúc.</p>
        
        {/* NÚT ĐĂNG NHẬP BÍ MẬT DÀNH CHO ADMIN CỦA BẠN */}
        <Link href="/login" className="absolute bottom-4 right-4 text-gray-300 hover:text-gray-500 transition">
          <span className="text-xs">🔒</span>
        </Link>
      </footer>
    </div>
  );
}