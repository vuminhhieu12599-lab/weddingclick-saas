"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "../lib/supabase";

export default function ThemeLuxury({ invitation, guestName, id }: { invitation: any, guestName: string, id: string }) {
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  const [rsvpName, setRsvpName] = useState(guestName);
  const [attendance, setAttendance] = useState("Có tham dự");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rsvpSuccess, setRsvpSuccess] = useState(false);
  const [showQRPopup, setShowQRPopup] = useState(false);
  const [showRSVPPopup, setShowRSVPPopup] = useState(false);

  useEffect(() => {
    // Logic Đếm ngược
    if (invitation?.wedding_date) {
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
    }
  }, [invitation]);

  useEffect(() => {
    // Hiệu ứng cuộn trang mượt mà (Thêm threshold để canh thời điểm xuất hiện chuẩn hơn)
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('active');
        }
      });
    }, { threshold: 0.15 });

    document.querySelectorAll('.reveal').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, []);

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

  let day = "01", month = "01", year = "2026";
  if (invitation.wedding_date && invitation.wedding_date.includes('.')) {
    const parts = invitation.wedding_date.split('.');
    day = parts[0]; month = parts[1]; year = parts[2];
  } else {
    day = invitation.wedding_date;
  }

  const albumArr = invitation.wedding_photos ? invitation.wedding_photos.split(',').filter((p: string) => p.trim() !== '') : [];

  return (
    <div className="bg-[#fcfbf9] min-h-screen flex justify-center selection:bg-[#c5a059] selection:text-white relative">
      
      {/* CSS: Hiệu ứng, Font & Texture Giấy */}
      <style dangerouslySetInnerHTML={{__html: `
        @import url('https://fonts.googleapis.com/css2?family=Great+Vibes&family=Montserrat:wght@300;400;500;600&family=Playfair+Display:ital,wght@0,400;0,600;1,400&display=swap');
        
        .font-signature { font-family: 'Great Vibes', cursive; }
        .font-serif-classic { font-family: 'Playfair Display', serif; }
        .font-sans-modern { font-family: 'Montserrat', sans-serif; }
        
        .bg-paper {
          background-color: #fcfbf9;
          background-image: url("https://www.transparenttextures.com/patterns/cream-paper.png");
        }

        /* Gia tốc cubic-bezier mới giúp hiệu ứng trượt chậm, nhẹ và bay bổng hơn */
        .reveal { opacity: 0; transform: translateY(35px); transition: all 1.5s cubic-bezier(0.22, 1, 0.36, 1); }
        .reveal.active { opacity: 1; transform: translateY(0); }
        
        .fade-in-slow { animation: fadeInSlow 2.5s ease-out forwards; }
        @keyframes fadeInSlow { from { opacity: 0; transform: scale(0.98); } to { opacity: 1; transform: scale(1); } }
        
        ::-webkit-scrollbar { display: none; }
        * { -ms-overflow-style: none; scrollbar-width: none; }

        .arch-image { border-radius: 150px 150px 10px 10px; border: 1px solid #eaddcf; padding: 8px; }
      `}} />

      <div className="w-full max-w-md bg-paper min-h-screen relative shadow-2xl overflow-x-hidden flex flex-col font-sans-modern text-[#4a3c31]">
        
        {/* ================= HERO LÃNG MẠN ================= */}
        <div className="pt-24 pb-12 text-center fade-in-slow">
          <p className="text-[10px] tracking-[0.4em] uppercase text-[#8b7e74] mb-8 font-medium">The Wedding Celebration Of</p>
          <h1 className="text-6xl text-[#4a3c31] mb-2 font-signature tracking-tight drop-shadow-sm">
            {invitation.bride_name.split(' ').pop()}
          </h1>
          <p className="text-xl text-[#c5a059] font-serif-classic italic my-2">&</p>
          <h1 className="text-6xl text-[#4a3c31] mb-10 font-signature tracking-tight drop-shadow-sm">
            {invitation.groom_name.split(' ').pop()}
          </h1>
          
          <div className="flex items-center justify-center gap-4 text-[#8b7e74] font-serif-classic">
            <span className="h-[1px] w-12 bg-[#eaddcf]"></span>
            <span className="tracking-widest text-sm text-[#4a3c31]">{day} . {month} . {year}</span>
            <span className="h-[1px] w-12 bg-[#eaddcf]"></span>
          </div>
        </div>

        {/* ẢNH KIẾN TRÚC VÒM */}
        <div className="w-full px-8 mb-12 fade-in-slow" style={{ animationDelay: '0.4s' }}>
          <div className="arch-image bg-white shadow-sm">
            <img src={invitation.cover_photo} alt="Cover" className="w-full rounded-[142px_142px_4px_4px] object-cover aspect-[3/4]" />
          </div>
        </div>

        {/* ================= ĐẾM NGƯỢC THỜI GIAN ================= */}
        {invitation.settings?.show_countdown && (
          <div className="px-8 mb-16 reveal flex justify-center gap-4">
            {[
              { label: 'Ngày', value: timeLeft.days },
              { label: 'Giờ', value: timeLeft.hours },
              { label: 'Phút', value: timeLeft.minutes },
              { label: 'Giây', value: timeLeft.seconds }
            ].map((item, idx) => (
              <div key={idx} className="flex flex-col items-center">
                <div className="w-14 h-14 rounded-full border border-[#c5a059] flex items-center justify-center text-[#4a3c31] font-serif-classic text-xl bg-white shadow-sm">
                  {item.value}
                </div>
                <span className="text-[9px] uppercase tracking-widest text-[#8b7e74] mt-2 font-semibold">{item.label}</span>
              </div>
            ))}
          </div>
        )}

        {/* ================= LỜI CHÀO VIP ================= */}
        {guestName && (
          <div className="px-8 text-center mb-16 reveal">
            <div className="border-t border-b border-[#eaddcf] py-8 relative bg-white/50 backdrop-blur-sm">
              <p className="text-[10px] uppercase tracking-widest text-[#8b7e74] mb-3 font-medium">Trân trọng kính mời</p>
              <h2 className="text-3xl font-serif-classic text-[#c5a059] italic mb-3">
                {guestName}
              </h2>
              <p className="text-[11px] text-[#5a5a5a] font-light leading-relaxed uppercase tracking-wider">Đến chung vui cùng gia đình<br/>trong ngày trọng đại</p>
            </div>
          </div>
        )}

        {/* ================= THÔNG TIN SỰ KIỆN ================= */}
        <div className="px-8 mb-12 reveal">
          <div className="bg-[#fcfbf9] border border-[#eaddcf] p-10 rounded-sm text-center relative shadow-sm">
            <div className="absolute inset-1.5 border border-[#eaddcf]/50 pointer-events-none"></div>
            
            <h3 className="font-serif-classic text-xl tracking-widest text-[#4a3c31] mb-8">
              {invitation.invitation_type === 'NHA_GAI' ? 'LỄ VU QUY' : 'LỄ THÀNH HÔN'}
            </h3>
            
            <div className="space-y-4 mb-8 text-[#5a5a5a] text-sm">
              <p className="font-light tracking-wide">Vào lúc <span className="font-semibold text-[#4a3c31]">{invitation.wedding_time}</span></p>
              <p className="font-semibold text-[#4a3c31] text-lg">{day} Tháng {month} Năm {year}</p>
              <p className="font-light italic text-[11px]">(Tức {invitation.lunar_date})</p>
            </div>
            
            <div className="w-12 h-[1px] bg-[#c5a059] mx-auto mb-6"></div>
            
            <p className="font-bold text-[#4a3c31] uppercase text-xs tracking-wider mb-2 leading-relaxed">
              {invitation.location_name}
            </p>
            <p className="text-[10px] text-[#8b7e74] tracking-wider uppercase mb-8">{invitation.wedding_address}</p>
            
            <div className="flex gap-3 relative z-10">
              {invitation.settings?.show_rsvp && (
                <button onClick={() => setShowRSVPPopup(true)} className="flex-1 bg-[#c5a059] text-white py-3.5 font-medium text-[10px] uppercase tracking-widest shadow-md hover:bg-[#b08d4b] transition-colors">
                  Phản Hồi
                </button>
              )}
              {invitation.settings?.show_gift && invitation.bank_qr && (
                <button onClick={() => setShowQRPopup(true)} className="flex-1 bg-white border border-[#4a3c31] text-[#4a3c31] py-3.5 font-medium text-[10px] uppercase tracking-widest hover:bg-[#4a3c31] hover:text-white transition-colors">
                  Gửi Quà
                </button>
              )}
            </div>
          </div>
        </div>

        {/* ================= NÚT CHỈ ĐƯỜNG ================= */}
        {invitation.map_link && (
          <div className="px-8 mb-16 reveal">
            <a href={invitation.map_link} target="_blank" className="block text-center border border-[#4a3c31] text-[#4a3c31] font-sans-modern text-[10px] uppercase tracking-widest py-3.5 hover:bg-[#4a3c31] hover:text-white transition-colors">
              📍 Chỉ đường tới Đám Cưới
            </a>
          </div>
        )}

        {/* ================= ALBUM ẢNH ================= */}
        {invitation.settings?.show_album && albumArr.length > 0 && (
          <div className="w-full px-6 mb-20">
            <h2 className="text-4xl text-center mb-10 font-serif-classic text-[#4a3c31] reveal">Album Ảnh Cưới</h2>
            
            <div className="columns-2 gap-3 space-y-3">
              {albumArr.map((url: string, index: number) => (
                <div key={index} className="reveal break-inside-avoid overflow-hidden border border-[#eaddcf] p-1 bg-white shadow-sm">
                  <img src={url} alt={`Wedding ${index}`} className="w-full h-auto object-cover grayscale-[15%] hover:grayscale-0 transition-all duration-700" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ================= FOOTER ================= */}
        <div className="w-full bg-[#4a3c31] pt-24 pb-16 text-center reveal mt-auto text-[#fcfbf9] relative overflow-hidden">
          <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/arabesque.png')]"></div>
          <div className="relative z-10">
            <h2 className="text-6xl font-signature mb-4 text-[#c5a059]">Thank You</h2>
            <p className="text-[10px] tracking-[0.3em] uppercase text-[#eaddcf] font-medium">
              {invitation.bride_name} & {invitation.groom_name}
            </p>
          </div>
        </div>
      </div>

      {/* ================= POPUP LỜI CHÚC (SÁNG MÀU) ================= */}
      {showRSVPPopup && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-[#4a3c31]/70 px-4 backdrop-blur-sm transition-opacity" onClick={() => setShowRSVPPopup(false)}>
          <div className="bg-[#fcfbf9] border border-[#c5a059] p-8 w-full max-w-sm relative font-sans-modern shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="absolute inset-2 border border-[#eaddcf]/60 pointer-events-none"></div>
            <button onClick={() => setShowRSVPPopup(false)} className="absolute top-4 right-5 text-[#8b7e74] hover:text-[#c5a059] text-2xl">&times;</button>
            <h2 className="text-2xl text-center font-serif-classic text-[#4a3c31] mb-2">Sổ Lưu Bút</h2>
            <p className="text-center text-[10px] text-[#8b7e74] uppercase tracking-widest mb-6">Xác nhận tham dự</p>
            
            {rsvpSuccess ? (
              <div className="text-[#c5a059] text-center font-serif-classic italic text-lg py-8">Cảm ơn bạn đã gửi lời chúc!</div>
            ) : (
              <form onSubmit={handleRsvpSubmit} className="space-y-5 text-left relative z-10">
                <input type="text" value={rsvpName} onChange={(e) => setRsvpName(e.target.value)} placeholder="Tên của bạn" className="w-full bg-white border border-[#eaddcf] px-4 py-3 focus:outline-none focus:border-[#c5a059] text-sm text-[#4a3c31] placeholder-gray-400" required />
                
                <select value={attendance} onChange={(e) => setAttendance(e.target.value)} className="w-full bg-white border border-[#eaddcf] px-4 py-3 focus:outline-none focus:border-[#c5a059] text-sm text-[#4a3c31]">
                  <option value="Có tham dự">Chắc chắn tham dự</option>
                  <option value="Cố gắng thu xếp">Sẽ cố gắng thu xếp</option>
                  <option value="Không tham dự">Rất tiếc không thể tham dự</option>
                </select>
                
                <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Lời chúc gửi đến cô dâu chú rể..." className="w-full bg-white border border-[#eaddcf] px-4 py-3 focus:outline-none focus:border-[#c5a059] text-sm resize-none text-[#4a3c31] placeholder-gray-400" rows={3}></textarea>
                
                <button type="submit" disabled={isSubmitting} className="w-full bg-[#4a3c31] text-white py-3.5 text-[10px] uppercase tracking-widest font-bold hover:bg-[#c5a059] transition-colors mt-2">
                  {isSubmitting ? "Đang gửi..." : "Gửi Xác Nhận"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ================= POPUP QR ================= */}
      {showQRPopup && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-[#4a3c31]/70 px-4 backdrop-blur-sm" onClick={() => setShowQRPopup(false)}>
          <div className="bg-[#fcfbf9] border-4 border-double border-[#eaddcf] p-8 w-full max-w-xs text-center relative font-sans-modern" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setShowQRPopup(false)} className="absolute top-2 right-4 text-gray-400 hover:text-[#4a3c31] text-3xl">&times;</button>
            <h3 className="font-serif-classic text-2xl mb-6 text-[#4a3c31] italic">Hộp Quà Cưới</h3>
            <div className="border border-[#eaddcf] p-3 mb-6 bg-white">
              <img src={invitation.bank_qr} alt="QR Code" className="w-full aspect-square object-contain" />
            </div>
            <div className="text-left text-sm text-[#5a5a5a] space-y-3 mb-6 bg-[#f5f1eb] p-4">
              <div><span className="text-[10px] uppercase tracking-widest text-[#8b7e74] block mb-1">Ngân hàng</span> <span className="font-semibold text-[#4a3c31]">{invitation.bank_name}</span></div>
              <div><span className="text-[10px] uppercase tracking-widest text-[#8b7e74] block mb-1">Chủ tài khoản</span> <span className="font-semibold text-[#4a3c31]">{invitation.bank_owner}</span></div>
              <div><span className="text-[10px] uppercase tracking-widest text-[#8b7e74] block mb-1">Số tài khoản</span> <span className="font-bold text-[#c5a059] text-lg tracking-wider">{invitation.bank_account}</span></div>
            </div>
            <button onClick={handleCopyBank} className="w-full bg-[#4a3c31] text-white py-3.5 text-[10px] uppercase tracking-widest font-bold hover:bg-[#c5a059] transition-colors">
              Copy số tài khoản
            </button>
          </div>
        </div>
      )}
      
      {/* ================= NÚT ÂM NHẠC ================= */}
      {invitation.settings?.show_music && invitation.audio_url && (
        <div className="fixed bottom-6 left-6 z-50">
          <div className="w-10 h-10 bg-white/90 backdrop-blur rounded-full flex items-center justify-center shadow-lg border border-[#c5a059]/50 animate-spin cursor-pointer" style={{ animationDuration: '5s' }}>
            <span className="text-sm">🎵</span>
          </div>
        </div>
      )}
    </div>
  );
}