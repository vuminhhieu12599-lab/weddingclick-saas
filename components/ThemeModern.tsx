"use client";

import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";

export default function ThemeModern({ invitation, guestName, id }: { invitation: any, guestName: string, id: string }) {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  
  // States cho Form RSVP
  const [rsvpName, setRsvpName] = useState(guestName);
  const [attendance, setAttendance] = useState("Có tham dự");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rsvpSuccess, setRsvpSuccess] = useState(false);
  
  // States điều khiển Pop-up
  const [showQRPopup, setShowQRPopup] = useState(false);
  const [showRSVPPopup, setShowRSVPPopup] = useState(false);

  // Quan sát hiệu ứng trượt mượt mà
  useEffect(() => {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('active');
        }
      });
    }, { threshold: 0.1 });

    document.querySelectorAll('.reveal, .reveal-left, .reveal-right').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

  // Đếm ngược
  useEffect(() => {
    if (!invitation?.wedding_date) return;
    const dateParts = invitation.wedding_date.split('.');
    const weddingDate = new Date(`${dateParts[2] || new Date().getFullYear()}-${dateParts[1] || '01'}-${dateParts[0] || '01'}T00:00:00`);

    const timer = setInterval(() => {
      const now = new Date();
      const difference = weddingDate.getTime() - now.getTime();
      if (difference > 0) {
        setTimeLeft({
          days: Math.floor(difference / (1000 * 60 * 60 * 24)),
          hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
          minutes: Math.floor((difference / 1000 / 60) % 60),
          seconds: Math.floor((difference / 1000) % 60),
        });
      } else {
        clearInterval(timer);
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [invitation]);

  // Gửi Lời chúc
  const handleRsvpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rsvpName) return alert("Vui lòng nhập tên của bạn!");
    setIsSubmitting(true);
    await supabase.from('wishes').insert([{ wedding_id: id, guest_name: rsvpName, attendance, message }]);
    setIsSubmitting(false);
    setRsvpSuccess(true);
  };

  const handleCopyBank = () => {
    navigator.clipboard.writeText(invitation.bank_account);
    alert("Đã sao chép số tài khoản!");
  };

  // Tách ngày tháng năm để xử lý lịch
  let day = "01", month = "01", year = "2026";
  if (invitation.wedding_date && invitation.wedding_date.includes('.')) {
    const parts = invitation.wedding_date.split('.');
    day = parts[0]; month = parts[1]; year = parts[2];
  } else {
    day = invitation.wedding_date;
  }

  let eventTitle = "LỄ THÀNH HÔN";
  if (invitation.invitation_type === 'NHA_GAI') eventTitle = "LỄ VU QUY";

  const albumArr = invitation.wedding_photos ? invitation.wedding_photos.split(',').filter((p: string) => p.trim() !== '') : [];
  
  // Tạo mảng ngày cho Lịch mini
  const calendarDays = Array.from({ length: 31 }, (_, i) => i + 1);

  return (
    <div className="bg-gray-100 min-h-screen flex justify-center selection:bg-rose-500 selection:text-white font-sans text-gray-800">
      
      {/* CSS Hiệu ứng & Ẩn thanh cuộn */}
      <style dangerouslySetInnerHTML={{__html: `
        /* Hiệu ứng trượt */
        .reveal { opacity: 0; transform: translateY(30px); transition: all 0.8s ease-out; }
        .reveal.active { opacity: 1; transform: translateY(0); }
        .reveal-left { opacity: 0; transform: translateX(-30px); transition: all 0.8s ease-out; }
        .reveal-left.active { opacity: 1; transform: translateX(0); }
        .reveal-right { opacity: 0; transform: translateX(30px); transition: all 0.8s ease-out; }
        .reveal-right.active { opacity: 1; transform: translateX(0); }
        
        /* Tàng hình thanh cuộn (Scrollbar) cho mọi trình duyệt */
        ::-webkit-scrollbar {
          display: none;
        }
        * {
          -ms-overflow-style: none;  /* IE and Edge */
          scrollbar-width: none;  /* Firefox */
        }
      `}} />

      {/* CONTAINER CHÍNH */}
      <div className="w-full max-w-md bg-white min-h-screen relative shadow-2xl overflow-x-hidden flex flex-col">
        
        {/* ================= HEADER ================= */}
        <div className="pt-16 pb-8 text-center reveal">
          <p className="text-[10px] text-gray-400 tracking-[0.3em] uppercase mb-4 font-medium">Save the date</p>
          <h1 className="text-5xl text-rose-500 mb-2 drop-shadow-sm" style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic" }}>
            {invitation.bride_name}
          </h1>
          <p className="text-xl text-gray-400 font-light my-1">&</p>
          <h1 className="text-5xl text-rose-500 mb-6 drop-shadow-sm" style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic" }}>
            {invitation.groom_name}
          </h1>
          <p className="text-sm text-rose-600 font-bold tracking-[0.2em]">
            {day} . {month} . {year}
          </p>
        </div>

        {/* ẢNH BÌA LỚN */}
        <div className="w-full px-5 mb-8 reveal">
          <img src={invitation.cover_photo} alt="Cover" className="w-full rounded-sm object-cover shadow-md aspect-[3/4]" />
        </div>

        {/* QUOTE LÃNG MẠN */}
        <div className="px-10 text-center mb-12 reveal">
          <p className="text-gray-500 italic text-sm leading-relaxed" style={{ fontFamily: "'Playfair Display', serif" }}>
            "Yêu đương là chuyện cả đời, yêu người vừa ý cưới người mình thương..."
          </p>
        </div>

        {/* ================= GIA ĐÌNH ================= */}
        <div className="text-center reveal mb-10">
          <div className="text-rose-300 text-2xl mb-6">❤️</div>
          <div className="grid grid-cols-2 gap-4 px-4">
            <div className="flex flex-col items-center">
              <p className="font-bold text-gray-600 text-[11px] tracking-widest uppercase mb-3">Nhà Trai</p>
              <p className="text-xs text-gray-800 font-bold mb-1">Ông: {invitation.groom_father}</p>
              <p className="text-xs text-gray-800 font-bold mb-5">Bà: {invitation.groom_mother}</p>
              <span className="bg-rose-50 text-rose-500 text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest mb-3">Chú rể</span>
              <p className="text-3xl text-rose-500 font-bold" style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic" }}>
                {invitation.groom_name.split(' ').pop()}
              </p>
            </div>
            <div className="flex flex-col items-center">
              <p className="font-bold text-gray-600 text-[11px] tracking-widest uppercase mb-3">Nhà Gái</p>
              <p className="text-xs text-gray-800 font-bold mb-1">Ông: {invitation.bride_father}</p>
              <p className="text-xs text-gray-800 font-bold mb-5">Bà: {invitation.bride_mother}</p>
              <span className="bg-rose-50 text-rose-500 text-[10px] font-bold px-3 py-1 rounded-full uppercase tracking-widest mb-3">Cô dâu</span>
              <p className="text-3xl text-rose-500 font-bold" style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic" }}>
                {invitation.bride_name.split(' ').pop()}
              </p>
            </div>
          </div>
        </div>

        {/* ================= LỜI CHÀO KHÁCH MỜI VIP ================= */}
        {guestName && (
          <div className="px-6 text-center mb-12 reveal">
            <p className="text-sm text-gray-500 mb-3 font-medium">Trân trọng kính mời</p>
            <div className="inline-block px-8 py-3 bg-rose-50 border border-rose-100 rounded-full shadow-sm relative">
              <div className="absolute -top-2 -left-2 text-rose-300 opacity-50 text-xl">✨</div>
              <h2 className="text-2xl font-bold text-rose-500" style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic" }}>
                {guestName}
              </h2>
              <div className="absolute -bottom-2 -right-2 text-rose-300 opacity-50 text-xl">✨</div>
            </div>
            <p className="text-xs text-gray-500 mt-4 font-medium uppercase tracking-widest">Đến dự buổi tiệc chung vui cùng gia đình</p>
          </div>
        )}

        {/* ================= CARD SỰ KIỆN ================= */}
        <div className="px-6 mb-12 reveal">
          <div className="bg-white rounded-[2rem] shadow-[0_10px_40px_rgba(244,63,94,0.1)] border border-rose-50 p-8 text-center relative overflow-hidden">
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-rose-50 rounded-full blur-2xl"></div>
            
            <h3 className="text-rose-500 font-bold text-lg tracking-widest uppercase mb-6">{eventTitle}</h3>
            
            <div className="flex items-center justify-center gap-6 mb-6">
              <div className="text-gray-600 font-medium">
                ⏱ {invitation.wedding_time}
              </div>
              <div className="bg-rose-500 text-white rounded-xl p-2 w-16 shadow-md shadow-rose-200">
                <p className="text-3xl font-bold leading-none">{day}</p>
                <div className="w-full h-px bg-rose-400 my-1"></div>
                <p className="text-[10px] uppercase font-bold tracking-wider">{month} / {year}</p>
              </div>
              <div className="text-gray-600 font-medium">
                🗓 Thứ 7
              </div>
            </div>
            
            <p className="text-[11px] text-gray-500 italic mb-4 font-medium">(Tức {invitation.lunar_date})</p>
            <p className="text-gray-900 font-bold mb-8 text-sm uppercase tracking-wider">{invitation.location_name}</p>

            {/* HAI NÚT CHỨC NĂNG (Đều bật Pop-up) */}
            <div className="flex gap-3">
              {invitation.settings?.show_rsvp && (
                <button onClick={() => setShowRSVPPopup(true)} className="flex-1 bg-rose-400 text-white py-3 rounded-2xl font-bold text-xs shadow-md shadow-rose-200 hover:bg-rose-500 transition-colors">
                  Gửi Lời Chúc
                </button>
              )}
              {invitation.settings?.show_gift && invitation.bank_qr && (
                <button onClick={() => setShowQRPopup(true)} className="flex-1 bg-white border border-rose-400 text-rose-500 py-3 rounded-2xl font-bold text-xs shadow-sm hover:bg-rose-50 transition-colors">
                  Mừng Cưới
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ================= LỊCH NGÀY HẠNH PHÚC ================= */}
        <div className="px-6 mb-12 reveal bg-rose-50/30 py-10">
          <h2 className="text-4xl text-rose-500 text-center mb-8 drop-shadow-sm" style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic" }}>
            Ngày Hạnh Phúc
          </h2>
          
          <div className="bg-white rounded-[2rem] shadow-lg border border-rose-50 p-6 text-center">
            <h3 className="text-rose-500 font-bold uppercase tracking-widest mb-6 text-sm">Tháng {month} - {year}</h3>
            
            <div className="grid grid-cols-7 gap-y-4 gap-x-2 text-[11px] font-bold">
              <div className="text-gray-400">T2</div><div className="text-gray-400">T3</div><div className="text-gray-400">T4</div><div className="text-gray-400">T5</div><div className="text-gray-400">T6</div><div className="text-gray-400">T7</div><div className="text-rose-500">CN</div>
              
              <div className="text-gray-300">29</div><div className="text-gray-300">30</div><div className="text-gray-300">31</div>
              {calendarDays.map((d) => (
                <div key={d} className={`flex items-center justify-center w-7 h-7 mx-auto rounded-full relative ${d.toString() === day ? 'bg-rose-500 text-white shadow-md shadow-rose-300 scale-125' : 'text-gray-700'}`}>
                  {d}
                  {d.toString() === day && <span className="absolute -top-1 -right-1 text-[8px]">❤️</span>}
                </div>
              ))}
            </div>
          </div>

          {/* BẢN ĐỒ */}
          {invitation.map_link && (
            <div className="mt-8 rounded-2xl overflow-hidden shadow-md border border-gray-200">
              <div className="bg-blue-100 aspect-video flex items-center justify-center">
                 <img src="https://static.vecteezy.com/system/resources/previews/000/153/588/original/vector-map-of-the-world.jpg" alt="Map" className="w-full h-full object-cover opacity-80" />
              </div>
              <a href={invitation.map_link} target="_blank" className="block text-center bg-white text-rose-500 font-bold text-xs py-3 border-t border-gray-100 hover:bg-gray-50">
                ↱ Chỉ đường đến đám cưới
              </a>
            </div>
          )}
        </div>

        {/* ================= ALBUM ẢNH ================= */}
        {invitation.settings?.show_album && albumArr.length > 0 && (
          <div className="w-full px-4 mb-16">
            <div className="text-center mb-8 reveal">
              <h2 className="text-4xl text-rose-500 drop-shadow-sm" style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic" }}>
                Album Ảnh Cưới
              </h2>
            </div>
            
            <div className="columns-2 gap-3 space-y-3">
              {albumArr.map((url: string, index: number) => (
                <div key={index} className={`break-inside-avoid overflow-hidden rounded-2xl shadow-sm border border-gray-100 ${index % 2 === 0 ? 'reveal-left' : 'reveal-right'}`}>
                  <img src={url} alt={`Wedding ${index}`} className="w-full h-auto object-cover hover:scale-105 transition-transform duration-500" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ================= FOOTER ================= */}
        <div className="w-full bg-[#8c8c8c] pt-16 pb-12 text-center reveal mt-auto relative overflow-hidden">
          <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/arabesque.png')]"></div>
          
          <div className="relative z-10">
            <h2 className="text-6xl text-white mb-6 drop-shadow-md" style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic" }}>
              Thank You!
            </h2>
            <p className="text-white text-sm tracking-widest font-medium opacity-90">
              {invitation.bride_name} & {invitation.groom_name}
            </p>
          </div>
        </div>
      </div>

      {/* ================= POPUP LỜI CHÚC (RSVP) ================= */}
      {showRSVPPopup && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm animate-fade-in-up" onClick={() => setShowRSVPPopup(false)}>
          <div className="bg-rose-50 p-6 rounded-[2rem] w-full max-w-sm text-center relative shadow-2xl border border-rose-100" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setShowRSVPPopup(false)} className="absolute top-3 right-5 text-gray-400 hover:text-rose-500 text-3xl transition-colors">&times;</button>
            
            <div className="text-center mb-6 mt-2">
              <h2 className="text-2xl text-rose-500 mb-2 drop-shadow-sm" style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic" }}>Gửi ngàn lời chúc tốt đẹp nhất đến cặp đôi</h2>
             
            </div>

            {rsvpSuccess ? (
              <div className="bg-white text-rose-500 p-6 rounded-2xl text-center font-bold shadow-sm">
                🎉 Cảm ơn bạn đã gửi lời chúc!
              </div>
            ) : (
              <form onSubmit={handleRsvpSubmit} className="space-y-4 text-left">
                <input type="text" value={rsvpName} onChange={(e) => setRsvpName(e.target.value)} placeholder="Tên của bạn là?" className="w-full bg-white text-gray-800 px-5 py-3.5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-rose-200 text-sm border border-transparent shadow-sm" required />
                
                <select value={attendance} onChange={(e) => setAttendance(e.target.value)} className="w-full bg-white text-gray-800 px-5 py-3.5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-rose-200 text-sm border border-transparent shadow-sm">
                  <option value="Có tham dự">Chắc chắn tham dự</option>
                  <option value="Cố gắng thu xếp">Cố gắng thu xếp</option>
                  <option value="Không tham dự">Rất tiếc không thể tham dự</option>
                </select>

                <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Gửi lời chúc đến Dâu Rể nhé!" className="w-full bg-white text-gray-800 px-5 py-3.5 rounded-2xl focus:outline-none focus:ring-2 focus:ring-rose-200 text-sm resize-none border border-transparent shadow-sm" rows={3}></textarea>
                
                <button type="submit" disabled={isSubmitting} className="w-full bg-rose-400 text-white py-3.5 rounded-2xl font-bold uppercase tracking-wider text-xs shadow-md shadow-rose-200 hover:bg-rose-500 transition-colors mt-2">
                  {isSubmitting ? "Đang gửi..." : "GỬI NGAY"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ================= POPUP QR MỪNG CƯỚI ================= */}
      {showQRPopup && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/60 px-4 backdrop-blur-sm animate-fade-in-up" onClick={() => setShowQRPopup(false)}>
          <div className="bg-white p-6 rounded-[2rem] w-full max-w-xs text-center relative shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setShowQRPopup(false)} className="absolute top-3 right-5 text-gray-300 hover:text-rose-500 text-3xl transition-colors">&times;</button>
            
            <h3 className="text-rose-500 font-bold tracking-widest uppercase mb-4 mt-2 text-sm border-b pb-3 mx-4 border-rose-50">Hộp Quà Cưới</h3>
            
            <div className="bg-rose-50 p-4 rounded-2xl mb-4">
              <img src={invitation.bank_qr} alt="QR Code" className="w-48 aspect-square object-contain mx-auto mix-blend-multiply" />
            </div>
            
            <div className="text-left bg-white px-2 mb-6">
              <div className="mb-2">
                <span className="text-[10px] text-gray-400 uppercase tracking-wider font-bold">Ngân hàng</span>
                <p className="font-bold text-gray-800 text-sm">{invitation.bank_name}</p>
              </div>
              <div className="mb-2">
                <span className="text-[10px] text-gray-400 uppercase tracking-wider font-bold">Chủ tài khoản</span>
                <p className="font-bold text-rose-500 uppercase text-sm">{invitation.bank_owner}</p>
              </div>
              <div>
                <span className="text-[10px] text-gray-400 uppercase tracking-wider font-bold">Số tài khoản</span>
                <p className="font-mono text-xl font-bold text-gray-900 tracking-wider">{invitation.bank_account}</p>
              </div>
            </div>

            <button onClick={handleCopyBank} className="w-full bg-rose-100 text-rose-600 py-3.5 rounded-2xl font-bold uppercase text-xs shadow-sm hover:bg-rose-200 transition-colors">
              Sao chép số tài khoản
            </button>
          </div>
        </div>
      )}
      
      {/* NÚT ÂM NHẠC */}
      {invitation.settings?.show_music && invitation.audio_url && (
        <div className="fixed bottom-6 left-6 z-50">
          <div className="w-10 h-10 bg-white/80 backdrop-blur rounded-full flex items-center justify-center shadow-[0_5px_15px_rgba(244,63,94,0.3)] border border-rose-100 animate-spin cursor-pointer" style={{ animationDuration: '4s' }}>
            <span className="text-xl">🎵</span>
          </div>
        </div>
      )}

    </div>
  );
}