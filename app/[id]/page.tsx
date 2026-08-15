"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function Page() {
  const params = useParams();
  const id = params?.id as string;

  const [guestName, setGuestName] = useState("");
  const [invitation, setInvitation] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  
  const [rsvpName, setRsvpName] = useState("");
  const [attendance, setAttendance] = useState("Có tham dự");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rsvpSuccess, setRsvpSuccess] = useState(false);
  
  const [showQRPopup, setShowQRPopup] = useState(false);
  
  const [isOpened, setIsOpened] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const searchParams = new URLSearchParams(window.location.search);
      const guest = searchParams.get("guest") || "";
      setGuestName(guest);
      setRsvpName(guest);
    }
  }, []);

  useEffect(() => {
    if (!id) return;
    const fetchInvitation = async () => {
      const { data } = await supabase.from('invitations').select('*').eq('id', id).single();
      if (data) setInvitation(data);
      setLoading(false);
    };
    fetchInvitation();
  }, [id]);

  useEffect(() => {
    if (loading || !invitation || !isOpened) return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('active');
        }
      });
    }, { threshold: 0.1 });

    document.querySelectorAll('.reveal, .reveal-left, .reveal-right').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [loading, invitation, isOpened]);

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

  const handleOpenInvitation = () => {
    setIsAnimating(true);
    const audio = document.getElementById('bg-music') as HTMLAudioElement;
    if (audio) {
      audio.play().catch(() => console.log("Trình duyệt chặn tự động phát nhạc"));
    }
    setTimeout(() => {
      setIsOpened(true);
    }, 1200);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-white text-[#9B1B1B] font-bold">Đang tải thiệp...</div>;
  if (!invitation) return <div className="min-h-screen flex items-center justify-center bg-white text-gray-500">Không tìm thấy thiệp cưới!</div>;

  let day = "01", month = "01", year = "2026";
  if (invitation.wedding_date && invitation.wedding_date.includes('.')) {
    const parts = invitation.wedding_date.split('.');
    day = parts[0]; month = parts[1]; year = parts[2];
  } else {
    day = invitation.wedding_date;
  }

  let eventTitle = "Tiệc mừng Lễ Thành Hôn";
  if (invitation.invitation_type === 'NHA_GAI') eventTitle = "Tiệc mừng Lễ Vu Quy";

  const trioArr = invitation.trio_photos ? invitation.trio_photos.split(',').filter((p: string) => p.trim() !== '') : [];

  return (
    <div className="bg-gray-100 min-h-screen flex justify-center selection:bg-[#9B1B1B] selection:text-white">
      
      {/* CSS HIỆU ỨNG TRƯỢT */}
      <style dangerouslySetInnerHTML={{__html: `
        .reveal { opacity: 0; transform: translateY(40px); transition: all 0.8s ease-out; }
        .reveal.active { opacity: 1; transform: translateY(0); }
        
        .reveal-left { opacity: 0; transform: translateX(-40px); transition: all 0.8s ease-out; }
        .reveal-left.active { opacity: 1; transform: translateX(0); }
        
        .reveal-right { opacity: 0; transform: translateX(40px); transition: all 0.8s ease-out; }
        .reveal-right.active { opacity: 1; transform: translateX(0); }
      `}} />

      {invitation.settings?.show_music && invitation.audio_url && (
        <audio id="bg-music" loop src={invitation.audio_url} />
      )}

      {/* ========================================= */}
      {/* RÈM ĐỎ (KHÔNG NỀN ĐEN) */}
      {/* ========================================= */}
      {!isOpened && (
        <div className="fixed inset-0 z-[999] flex justify-center overflow-hidden pointer-events-none">
          <div className="w-full max-w-md h-full relative flex overflow-hidden">
            {/* Rèm trái */}
            <div className={`pointer-events-auto w-1/2 h-full bg-[#9B1B1B] border-r border-[#E5C158] transition-transform duration-1000 ease-in-out ${isAnimating ? '-translate-x-full' : 'translate-x-0'}`} style={{ backgroundImage: "url('https://www.transparenttextures.com/patterns/arabesque.png')" }}></div>
            
            {/* Rèm phải */}
            <div className={`pointer-events-auto w-1/2 h-full bg-[#9B1B1B] border-l border-[#E5C158] transition-transform duration-1000 ease-in-out ${isAnimating ? 'translate-x-full' : 'translate-x-0'}`} style={{ backgroundImage: "url('https://www.transparenttextures.com/patterns/arabesque.png')" }}></div>
            
            {/* Nội dung trên rèm */}
            <div className={`pointer-events-auto absolute inset-0 flex flex-col items-center justify-center transition-opacity duration-500 ${isAnimating ? 'opacity-0' : 'opacity-100'}`}>
              <p className="text-[#E5C158] font-bold tracking-[0.2em] uppercase text-sm mb-4 drop-shadow-md">Thiệp Mời</p>
              
              <h2 className="text-4xl text-white mb-10 drop-shadow-lg px-4 text-center" style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic" }}>
                {invitation.bride_name} <span className="text-[#E5C158] text-3xl mx-1">&</span> {invitation.groom_name}
              </h2>

              <button onClick={handleOpenInvitation} className="relative w-24 h-24 bg-[#9B1B1B] text-[#E5C158] flex items-center justify-center shadow-2xl hover:scale-105 transition-transform animate-pulse cursor-pointer">
                <div className="absolute inset-1.5 border border-[#E5C158]"></div>
                <div className="absolute inset-0 border-2 border-[#9B1B1B]"></div>
                <span className="absolute top-1 left-1 w-2 h-2 border-t border-l border-[#E5C158]"></span>
                <span className="absolute top-1 right-1 w-2 h-2 border-t border-r border-[#E5C158]"></span>
                <span className="absolute bottom-1 left-1 w-2 h-2 border-b border-l border-[#E5C158]"></span>
                <span className="absolute bottom-1 right-1 w-2 h-2 border-b border-r border-[#E5C158]"></span>
                <span className="text-5xl drop-shadow-md font-sans">囍</span>
              </button>

              <div className="text-center mt-10 text-white drop-shadow-md">
                <p className="text-xs tracking-[0.2em] uppercase mb-2 font-medium">Chủ Nhật - {invitation.wedding_time}</p>
                <p className="text-2xl font-bold tracking-[0.2em]">{invitation.wedding_date}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================= */}
      {/* THIỆP CHÍNH */}
      {/* ========================================= */}
      <div className="w-full max-w-md bg-[#FDFBF7] min-h-screen relative shadow-2xl overflow-hidden flex flex-col">
        
        {/* Viền vàng */}
        <div className="absolute top-0 bottom-0 left-0 w-3 bg-[#E5C158]/60 bg-[url('https://www.transparenttextures.com/patterns/gold-scale.png')] z-0 pointer-events-none"></div>
        <div className="absolute top-0 bottom-0 right-0 w-3 bg-[#E5C158]/60 bg-[url('https://www.transparenttextures.com/patterns/gold-scale.png')] z-0 pointer-events-none"></div>

        <div className="relative z-10 px-6 py-12 flex-grow flex flex-col">
          
          {/* Lời chào */}
          {guestName && (
            <div className="text-center mb-8 reveal">
              <p className="text-sm text-gray-500 font-medium">Trân trọng kính mời</p>
              <h2 className="text-2xl font-bold text-[#9B1B1B] mt-1" style={{ fontFamily: "'Playfair Display', serif" }}>{guestName}</h2>
            </div>
          )}

          {/* Tiêu đề & Ngày giờ */}
          <div className="text-center reveal mb-8 mt-4">
            <h3 className="text-sm font-bold tracking-[0.3em] text-gray-500 uppercase mb-4">Thiệp Mời</h3>
            <h1 className="text-4xl font-bold text-gray-900 leading-tight" style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic" }}>
              {invitation.bride_name} <span className="text-[#9B1B1B] mx-1">&</span> {invitation.groom_name}
            </h1>
            <div className="text-[#9B1B1B] text-5xl mt-6 mb-4">囍</div>
            <p className="text-sm font-bold text-gray-800 tracking-widest uppercase mb-1">{invitation.wedding_time}</p>
            <p className="text-xl font-bold text-gray-800 tracking-widest">{invitation.wedding_date}</p>
          </div>

          {/* Ảnh bìa */}
          <div className="w-[90%] mx-auto mb-10 reveal">
            <div className="aspect-[3/4] border-[3px] border-[#9B1B1B] bg-white relative p-1 shadow-md">
              <img src={invitation.cover_photo} alt="Cover" className="w-full h-full object-cover" />
            </div>
          </div>

          {/* Đếm ngược (Kèm chữ) */}
          {invitation.settings?.show_countdown && (
            <div className="w-full mb-12 reveal">
              <p className="text-center text-[#9B1B1B] font-bold text-[13px] tracking-widest uppercase mb-6">Đếm ngược tới ngày chung đôi</p>
              <div className="flex justify-center gap-3">
                {[
                  { label: 'Ngày', value: timeLeft.days },
                  { label: 'Giờ', value: timeLeft.hours },
                  { label: 'Phút', value: timeLeft.minutes },
                  { label: 'Giây', value: timeLeft.seconds },
                ].map((item, idx) => (
                  <div key={idx} className="w-16 h-16 rounded-full border border-gray-300 flex flex-col items-center justify-center bg-white shadow-sm">
                    <span className="text-xl font-bold text-[#9B1B1B] leading-none">{item.value}</span>
                    <span className="text-[9px] text-gray-600 uppercase mt-1 font-bold">{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Gia đình (Kèm tên dâu rể đổi màu) */}
          <div className="text-center reveal mb-12">
            <div className="flex justify-center mb-6">
              <div className="w-10 h-10 border border-[#9B1B1B] rounded-full flex items-center justify-center text-[#9B1B1B]">囍</div>
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div className="flex flex-col h-full">
                <p className="font-bold text-gray-900 text-xs tracking-widest uppercase mb-3">Nhà Trai</p>
                <p className="text-sm text-gray-800 font-bold mb-1">Ông {invitation.groom_father}</p>
                <p className="text-sm text-gray-800 font-bold mb-4">Bà {invitation.groom_mother}</p>
                <div className="mt-auto pt-3 border-t border-gray-200">
                  <p className="text-xs font-bold text-[#b01010] uppercase tracking-wider mb-1">Chú rể</p>
                  <p className="text-lg text-gray-900 font-bold" style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic" }}>{invitation.groom_name}</p>
                </div>
              </div>
              <div className="flex flex-col h-full">
                <p className="font-bold text-gray-900 text-xs tracking-widest uppercase mb-3">Nhà Gái</p>
                <p className="text-sm text-gray-800 font-bold mb-1">Ông {invitation.bride_father}</p>
                <p className="text-sm text-gray-800 font-bold mb-4">Bà {invitation.bride_mother}</p>
                <div className="mt-auto pt-3 border-t border-gray-200">
                  <p className="text-xs font-bold text-[#b01010] uppercase tracking-wider mb-1">Cô dâu</p>
                  <p className="text-lg text-gray-900 font-bold" style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic" }}>{invitation.bride_name}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Bộ 3 ảnh */}
          <div className="text-center reveal mb-6 pt-6 border-t border-gray-200">
            <div className="text-[#E5C158] text-xl mb-2">❦</div>
            <h2 className="text-3xl text-gray-800 mb-6" style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic" }}>
              Trân Trọng Kính Mời
            </h2>
          </div>
          
          {trioArr.length > 0 && (
            <div className="flex justify-center items-start gap-2 mb-12 reveal">
              <div className="w-1/3 translate-y-6">
                <img src={trioArr[0]} className="w-full aspect-[3/4] object-cover shadow-sm rounded-sm border border-gray-200" />
              </div>
              <div className="w-1/3 z-10 relative">
                <img src={trioArr[1] || trioArr[0]} className="w-full aspect-[3/4] object-cover shadow-xl border-2 border-white scale-110 rounded-sm" />
              </div>
              <div className="w-1/3 translate-y-6">
                <img src={trioArr[2] || trioArr[0]} className="w-full aspect-[3/4] object-cover shadow-sm rounded-sm border border-gray-200" />
              </div>
            </div>
          )}

          {/* Cụm Thời gian */}
          <div className="text-center reveal mb-12 mt-6">
            <h3 className="text-gray-800 font-bold text-lg tracking-widest uppercase mb-2">{eventTitle}</h3>
            <p className="text-gray-600 text-sm mb-6">Vào Lúc</p>

            <div className="flex items-center justify-center gap-4 mb-6">
              <div className="text-right flex-1">
                <p className="text-sm text-gray-800 font-bold">{invitation.wedding_time}</p>
              </div>
              <div className="w-px h-16 bg-gray-400"></div>
              <div className="text-center w-24">
                <p className="text-xs text-gray-600 font-bold uppercase">Tháng {month}</p>
                <p className="text-5xl font-bold text-gray-900 my-1">{day}</p>
                <p className="text-xs text-gray-600 font-bold uppercase">Năm {year}</p>
              </div>
              <div className="w-px h-16 bg-gray-400"></div>
              <div className="text-left flex-1">
                <p className="text-sm text-gray-800 font-bold">Thứ Bảy</p>
              </div>
            </div>
            <p className="text-sm text-gray-800 italic font-medium">(Tức {invitation.lunar_date})</p>
          </div>

          {/* Địa điểm */}
          <div className="mb-12 reveal">
            <p className="text-center text-sm text-gray-800 uppercase tracking-widest mb-4">Buổi tiệc được tổ chức tại</p>
            <div className="border-2 border-[#9B1B1B] rounded-3xl p-6 text-center bg-white shadow-md relative">
              <h3 className="text-xl font-bold text-gray-900 mb-2">{invitation.location_name}</h3>
              <p className="text-sm text-gray-700 mb-6 leading-relaxed font-medium">{invitation.wedding_address}</p>
              {invitation.map_link && (
                <a href={invitation.map_link} target="_blank" className="inline-block bg-[#b01010] text-white px-8 py-2.5 rounded-full text-sm font-bold shadow-md hover:bg-red-800 transition-colors">
                  Xem Chỉ Đường
                </a>
              )}
            </div>
          </div>

          {/* Lời chúc */}
          {invitation.settings?.show_rsvp && (
            <div className="mb-6 reveal">
              <div className="text-center mb-6">
                <h2 className="text-3xl text-gray-800 leading-snug" style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic" }}>
                  Xác Nhận Tham Dự <br/> & <br/> Gửi Lời Chúc
                </h2>
              </div>

              <div className="bg-[#b01010] p-6 rounded-3xl shadow-xl">
                {rsvpSuccess ? (
                  <div className="bg-white/20 text-white p-4 rounded-xl text-center font-bold">
                    🎉 Cảm ơn bạn đã gửi lời chúc!
                  </div>
                ) : (
                  <form onSubmit={handleRsvpSubmit} className="space-y-4">
                    <input type="text" value={rsvpName} onChange={(e) => setRsvpName(e.target.value)} placeholder="Tên của bạn là?" className="w-full bg-white text-gray-800 px-4 py-3 rounded-xl focus:outline-none font-medium text-sm" required />
                    
                    <select value={attendance} onChange={(e) => setAttendance(e.target.value)} className="w-full bg-white text-gray-800 px-4 py-3 rounded-xl focus:outline-none font-medium text-sm">
                      <option value="Có tham dự">Bạn có tham dự không? (Có)</option>
                      <option value="Không tham dự">Rất tiếc không thể tham dự</option>
                    </select>

                    <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Gửi lời chúc đến Dâu Rể nhé!" className="w-full bg-white text-gray-800 px-4 py-3 rounded-xl focus:outline-none font-medium text-sm resize-none" rows={3}></textarea>
                    
                    <button type="submit" disabled={isSubmitting} className="w-full bg-white text-[#9B1B1B] py-3.5 rounded-xl font-bold uppercase text-sm hover:bg-gray-100 transition-colors mt-2">
                      {isSubmitting ? "Đang gửi..." : "GỬI NGAY"}
                    </button>
                  </form>
                )}
              </div>
            </div>
          )}

          {/* Nút Mừng Cưới */}
          {invitation.settings?.show_gift && invitation.bank_qr && (
            <div className="text-center mb-16 reveal">
              <button onClick={() => setShowQRPopup(true)} className="w-full bg-[#b01010] text-white py-3.5 rounded-xl font-bold uppercase text-sm shadow-md hover:bg-red-800 transition-transform hover:-translate-y-1">
                GỬI MỪNG CƯỚI
              </button>
            </div>
          )}

          {/* Album Cưới */}
          {invitation.settings?.show_album && invitation.wedding_photos && (
            <div className="w-full mb-12">
              <div className="flex items-center justify-center gap-4 mb-8 reveal">
                <h3 className="text-3xl text-gray-800" style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic" }}>Album hình cưới</h3>
                <div className="text-[#E5C158] text-xl">✻</div>
              </div>
              <div className="grid grid-cols-2 gap-3 overflow-hidden p-1">
                {invitation.wedding_photos.split(',').map((url: string, index: number) => (
                  <div key={index} className={`aspect-[3/4] bg-gray-100 rounded-sm shadow-md border border-gray-200 ${index % 2 === 0 ? 'reveal-left' : 'reveal-right'}`}>
                    <img src={url} alt={`Wedding ${index}`} className="w-full h-full object-cover" />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Thank You Footer */}
          <div className="w-full h-72 relative mt-auto reveal rounded-xl overflow-hidden shadow-lg">
            <img src={invitation.cover_photo} className="absolute inset-0 w-full h-full object-cover" />
            <div className="absolute inset-0 bg-white/50 backdrop-blur-[2px] flex flex-col items-center justify-center text-gray-800">
              <h2 className="text-6xl mb-2" style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic" }}>thankyou</h2>
              <p className="text-xl font-bold" style={{ fontFamily: "'Playfair Display', serif", fontStyle: "italic" }}>Rất hân hạnh được đón tiếp!</p>
            </div>
          </div>

        </div>
      </div>

      {/* ========================================= */}
      {/* POPUP MÃ QR */}
      {/* ========================================= */}
      {showQRPopup && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm" onClick={() => setShowQRPopup(false)}>
          <div className="bg-white p-6 rounded-3xl w-full max-w-sm text-center relative" onClick={(e) => e.stopPropagation()}>
            <button onClick={() => setShowQRPopup(false)} className="absolute top-2 right-4 text-gray-400 hover:text-gray-800 text-3xl">&times;</button>
            
            <h3 className="text-[#9B1B1B] font-bold tracking-widest uppercase mb-4 mt-2 border-b pb-3 mx-4 border-gray-100">Gửi Mừng Cưới</h3>
            
            <div className="bg-gray-50 p-4 rounded-2xl mb-4 border border-gray-100">
              <img src={invitation.bank_qr} alt="QR Code" className="w-48 aspect-square object-contain mx-auto mix-blend-multiply" />
            </div>
            
            <div className="text-left bg-red-50/50 p-4 rounded-xl mb-6 border border-red-100">
              <div className="mb-2">
                <span className="text-xs text-gray-500 uppercase tracking-wider font-bold">Ngân hàng</span>
                <p className="font-bold text-gray-800">{invitation.bank_name}</p>
              </div>
              <div className="mb-2">
                <span className="text-xs text-gray-500 uppercase tracking-wider font-bold">Chủ tài khoản</span>
                <p className="font-bold text-[#b01010] uppercase">{invitation.bank_owner}</p>
              </div>
              <div>
                <span className="text-xs text-gray-500 uppercase tracking-wider font-bold">Số tài khoản</span>
                <p className="font-mono text-xl font-bold text-gray-900 tracking-wider">{invitation.bank_account}</p>
              </div>
            </div>

            <button onClick={handleCopyBank} className="w-full bg-[#E5C158] text-[#9B1B1B] py-3.5 rounded-xl font-bold uppercase text-sm shadow-md hover:bg-yellow-400 transition-colors flex items-center justify-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
              Sao chép số tài khoản
            </button>
          </div>
        </div>
      )}

      {/* NÚT ÂM NHẠC */}
      {invitation.settings?.show_music && invitation.audio_url && isOpened && (
        <div className="fixed bottom-6 left-6 z-50">
          <div className="w-10 h-10 bg-white/80 backdrop-blur rounded-full flex items-center justify-center shadow-lg border border-gray-200 animate-spin cursor-pointer" style={{ animationDuration: '4s' }}>
            <span className="text-xl">🎵</span>
          </div>
        </div>
      )}

    </div>
  );
}