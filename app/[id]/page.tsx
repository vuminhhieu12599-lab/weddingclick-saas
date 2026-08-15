"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabase";

export default function InvitationTemplate() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id as string;
  const guestName = searchParams.get("guest") || "";

  const [invitation, setInvitation] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });
  
  // State cho Form RSVP
  const [rsvpName, setRsvpName] = useState(guestName);
  const [attendance, setAttendance] = useState("Có tham dự");
  const [message, setMessage] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rsvpSuccess, setRsvpSuccess] = useState(false);

  useEffect(() => {
    const fetchInvitation = async () => {
      const { data } = await supabase.from('invitations').select('*').eq('id', id).single();
      if (data) setInvitation(data);
      setLoading(false);
    };
    fetchInvitation();
  }, [id]);

  // Cài đặt hiệu ứng mượt mà khi cuộn trang (Scroll Reveal)
  useEffect(() => {
    if (loading) return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('opacity-100', 'translate-y-0');
          entry.target.classList.remove('opacity-0', 'translate-y-12');
        }
      });
    }, { threshold: 0.1 });

    const hiddenElements = document.querySelectorAll('.reveal');
    hiddenElements.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [loading]);

  // Logic Đếm ngược
  useEffect(() => {
    if (!invitation?.wedding_date) return;
    
    // Chuyển đổi định dạng ngày DD.MM.YYYY sang định dạng chuẩn YYYY-MM-DD
    const dateParts = invitation.wedding_date.split('.');
    const weddingDate = new Date(`${dateParts[2]}-${dateParts[1]}-${dateParts[0]}T00:00:00`);

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
    
    await supabase.from('wishes').insert([{
      wedding_id: id, guest_name: rsvpName, attendance, message
    }]);
    
    setIsSubmitting(false);
    setRsvpSuccess(true);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#FDFBF7] text-[#9B1B1B] font-bold">Đang tải thiệp...</div>;
  if (!invitation) return <div className="min-h-screen flex items-center justify-center bg-[#FDFBF7] text-gray-500">Không tìm thấy thiệp cưới!</div>;

  // Xử lý Tên Loại Tiệc
  let eventTypeName = "LỄ BÁO HỶ";
  if (invitation.invitation_type === 'NHA_TRAI') eventTypeName = "LỄ THÀNH HÔN";
  if (invitation.invitation_type === 'NHA_GAI') eventTypeName = "LỄ VU QUY";

  return (
    <div className="min-h-screen bg-[#FDFBF7] font-sans text-gray-800 relative overflow-x-hidden selection:bg-[#E5C158] selection:text-[#9B1B1B]">
      
      {/* KHUNG VIỀN TRANG TRÍ (Mẫu sọc truyền thống) */}
      <div className="fixed top-0 bottom-0 left-0 w-3 md:w-5 bg-[url('https://www.transparenttextures.com/patterns/gold-scale.png')] bg-[#E5C158]/80 z-50 shadow-md"></div>
      <div className="fixed top-0 bottom-0 right-0 w-3 md:w-5 bg-[url('https://www.transparenttextures.com/patterns/gold-scale.png')] bg-[#E5C158]/80 z-50 shadow-md"></div>

      {/* HIỆU ỨNG TRÁI TIM RƠI (Chỉ hiện nếu setting bật) */}
      {invitation.settings?.show_effect && (
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
          {[...Array(12)].map((_, i) => (
            <div key={i} className="absolute text-[#9B1B1B]/30 animate-pulse" 
                 style={{ 
                   left: `${Math.random() * 100}%`, 
                   top: `-${Math.random() * 20}%`,
                   fontSize: `${Math.random() * 15 + 10}px`,
                   animation: `fall ${Math.random() * 10 + 10}s linear infinite`,
                   animationDelay: `${Math.random() * 5}s`
                 }}>
              ❤️
            </div>
          ))}
          <style dangerouslySetInnerHTML={{__html: `
            @keyframes fall {
              0% { transform: translateY(0vh) translateX(0) rotate(0deg); opacity: 1; }
              100% { transform: translateY(120vh) translateX(20px) rotate(360deg); opacity: 0; }
            }
          `}} />
        </div>
      )}

      {/* NỘI DUNG CHÍNH NẰM TRONG KHUNG */}
      <div className="max-w-md mx-auto relative z-10 pt-16 pb-10 px-6 sm:px-8 bg-white/50 min-h-screen shadow-2xl shadow-[#E5C158]/10">
        
        {/* LỜI CHÀO GUEST VIP (Nếu có) */}
        {guestName && (
          <div className="text-center mb-8 reveal opacity-0 translate-y-12 transition-all duration-1000 ease-out">
            <p className="text-sm text-gray-500 font-medium">Trân trọng kính mời</p>
            <h2 className="text-2xl font-bold text-[#9B1B1B] mt-1" style={{ fontFamily: "'Playfair Display', serif" }}>{guestName}</h2>
          </div>
        )}

        {/* 1. TÊN CÔ DÂU CHÚ RỂ */}
        <div className="text-center reveal opacity-0 translate-y-12 transition-all duration-1000 ease-out">
          <h3 className="text-xs font-bold tracking-[0.3em] text-gray-400 uppercase mb-4">Thiệp Mời</h3>
          <h1 className="text-4xl sm:text-5xl font-bold text-[#1a2b4c] leading-tight" style={{ fontFamily: "'Playfair Display', serif" }}>
            {invitation.bride_name} <br/> 
            <span className="text-3xl text-[#E5C158] italic">&</span> <br/> 
            {invitation.groom_name}
          </h1>
          <div className="text-[#9B1B1B] text-5xl mt-6 mb-2">囍</div>
        </div>

        {/* 2. ẢNH BÌA LỚN MỞ RỘNG NGANG (Đã sửa theo yêu cầu 1) */}
        <div className="w-full mt-8 reveal opacity-0 translate-y-12 transition-all duration-1000 ease-out">
          <div className="w-full aspect-[3/4] bg-white p-1.5 shadow-[0_15px_30px_rgba(155,27,27,0.15)] border border-[#E5C158]/30">
            <div className="w-full h-full border border-[#9B1B1B]/20 overflow-hidden relative">
              <img src={invitation.cover_photo} alt="Cover" className="w-full h-full object-cover transform hover:scale-105 transition-transform duration-1000" />
            </div>
          </div>
        </div>

        {/* 3. CỤM ĐẾM NGƯỢC (Chuyển lên trên, thiết kế thanh mảnh - Yêu cầu 2) */}
        {invitation.settings?.show_countdown && (
          <div className="mt-10 reveal opacity-0 translate-y-12 transition-all duration-1000 ease-out">
            <p className="text-center text-xs font-bold text-[#9B1B1B] uppercase tracking-[0.2em] mb-4">Cùng đếm ngược</p>
            <div className="flex justify-center gap-3 sm:gap-4">
              {[
                { label: 'Ngày', value: timeLeft.days },
                { label: 'Giờ', value: timeLeft.hours },
                { label: 'Phút', value: timeLeft.minutes },
                { label: 'Giây', value: timeLeft.seconds },
              ].map((item, idx) => (
                <div key={idx} className="w-16 h-16 sm:w-16 sm:h-16 rounded-full border border-[#E5C158] flex flex-col items-center justify-center bg-white shadow-sm">
                  <span className="text-xl font-bold text-[#9B1B1B] leading-none">{item.value}</span>
                  <span className="text-[9px] text-gray-500 uppercase tracking-widest mt-1">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 4. CỤM LỄ VU QUY / THÀNH HÔN & THỜI GIAN (Thiết kế tạp chí - Yêu cầu 2) */}
        <div className="mt-16 reveal opacity-0 translate-y-12 transition-all duration-1000 ease-out px-2">
          <h2 className="text-center text-[#9B1B1B] font-bold text-xl tracking-[0.2em] uppercase mb-8">
            {eventTypeName}
          </h2>

          <div className="border-y border-[#E5C158]/60 py-8 relative text-center mx-4">
            {/* Họa tiết trang trí */}
            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#FDFBF7] px-3 text-[#E5C158] text-lg">❦</div>

            <div className="text-5xl font-bold text-gray-800 mb-3 drop-shadow-sm" style={{ fontFamily: "'Playfair Display', serif" }}>
              {invitation.wedding_time}
            </div>
            <div className="flex items-center justify-center gap-4 mb-3">
              <div className="h-px w-12 bg-gray-300"></div>
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.3em]">Ngày</div>
              <div className="h-px w-12 bg-gray-300"></div>
            </div>
            <div className="text-3xl font-bold text-[#9B1B1B] tracking-wide mb-2">
              {invitation.wedding_date}
            </div>
            <div className="text-sm text-gray-500 italic font-medium">
              ({invitation.lunar_date})
            </div>

            {/* Họa tiết trang trí */}
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2 bg-[#FDFBF7] px-3 text-[#E5C158] text-lg">❦</div>
          </div>
        </div>

        {/* 5. GIA ĐÌNH HAI BÊN */}
        <div className="grid grid-cols-2 gap-4 mt-12 reveal opacity-0 translate-y-12 transition-all duration-1000 ease-out text-center">
          <div className="p-4 bg-white/60 rounded-xl border border-red-50">
            <p className="font-bold text-[#9B1B1B] text-sm tracking-widest uppercase mb-3">Nhà Trai</p>
            <p className="text-sm text-gray-700 mb-1 font-medium">Ông: {invitation.groom_father}</p>
            <p className="text-sm text-gray-700 font-medium">Bà: {invitation.groom_mother}</p>
          </div>
          <div className="p-4 bg-white/60 rounded-xl border border-red-50">
            <p className="font-bold text-[#9B1B1B] text-sm tracking-widest uppercase mb-3">Nhà Gái</p>
            <p className="text-sm text-gray-700 mb-1 font-medium">Ông: {invitation.bride_father}</p>
            <p className="text-sm text-gray-700 font-medium">Bà: {invitation.bride_mother}</p>
          </div>
        </div>

        {/* 6. ĐỊA ĐIỂM TỔ CHỨC */}
        <div className="mt-16 text-center reveal opacity-0 translate-y-12 transition-all duration-1000 ease-out">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-[0.2em] mb-2">Địa điểm tổ chức</p>
          <p className="text-xl font-bold text-[#1a2b4c] mb-3" style={{ fontFamily: "'Playfair Display', serif" }}>{invitation.location_name}</p>
          <p className="text-sm text-gray-600 mb-6 px-4">{invitation.wedding_address}</p>
          
          {invitation.map_link && (
            <a href={invitation.map_link} target="_blank" className="inline-block border border-[#9B1B1B] text-[#9B1B1B] px-8 py-3 rounded-full text-xs font-bold uppercase tracking-widest hover:bg-[#9B1B1B] hover:text-white transition-all duration-300">
              Chỉ đường Google Maps
            </a>
          )}
        </div>

        {/* 7. ALBUM ẢNH CƯỚI */}
        {invitation.settings?.show_album && invitation.wedding_photos && (
          <div className="mt-20 reveal opacity-0 translate-y-12 transition-all duration-1000 ease-out">
            <h3 className="text-center text-[#9B1B1B] font-bold tracking-[0.2em] uppercase mb-8">Album Cưới</h3>
            <div className="grid grid-cols-2 gap-2">
              {invitation.wedding_photos.split(',').map((url: string, index: number) => (
                <div key={index} className="aspect-square overflow-hidden bg-gray-100 border border-gray-200">
                  <img src={url} alt={`Wedding ${index}`} className="w-full h-full object-cover hover:scale-110 transition-transform duration-500" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 8. FORM XÁC NHẬN THAM DỰ (RSVP) */}
        {invitation.settings?.show_rsvp && (
          <div className="mt-20 bg-white p-6 sm:p-8 rounded-2xl shadow-lg border border-[#E5C158]/30 reveal opacity-0 translate-y-12 transition-all duration-1000 ease-out">
            <h3 className="text-xl font-bold text-[#9B1B1B] text-center mb-2" style={{ fontFamily: "'Playfair Display', serif" }}>Xác Nhận Tham Dự</h3>
            <p className="text-xs text-center text-gray-500 mb-6">Sự hiện diện của bạn là niềm vinh hạnh cho gia đình chúng tôi.</p>
            
            {rsvpSuccess ? (
              <div className="bg-green-50 text-green-700 p-4 rounded-xl text-center font-bold border border-green-200">
                🎉 Cảm ơn bạn đã gửi lời chúc!
              </div>
            ) : (
              <form onSubmit={handleRsvpSubmit} className="space-y-4">
                <input type="text" value={rsvpName} onChange={(e) => setRsvpName(e.target.value)} placeholder="Tên của bạn..." className="w-full border-b border-gray-300 bg-transparent py-3 focus:border-[#9B1B1B] focus:outline-none text-sm transition-colors" required />
                <select value={attendance} onChange={(e) => setAttendance(e.target.value)} className="w-full border-b border-gray-300 bg-transparent py-3 focus:border-[#9B1B1B] focus:outline-none text-sm transition-colors text-gray-700">
                  <option value="Có tham dự">Chắc chắn tham dự</option>
                  <option value="Không tham dự">Rất tiếc không thể tham dự</option>
                </select>
                <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Gửi lời chúc tốt đẹp nhất..." className="w-full border-b border-gray-300 bg-transparent py-3 focus:border-[#9B1B1B] focus:outline-none text-sm transition-colors resize-none" rows={2}></textarea>
                <button type="submit" disabled={isSubmitting} className="w-full bg-[#9B1B1B] text-white py-4 rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-red-800 transition-colors mt-2 shadow-md">
                  {isSubmitting ? "Đang gửi..." : "Gửi Xác Nhận"}
                </button>
              </form>
            )}
          </div>
        )}

        {/* 9. MÃ QR MỪNG CƯỚI */}
        {invitation.settings?.show_gift && invitation.bank_qr && (
          <div className="mt-16 text-center reveal opacity-0 translate-y-12 transition-all duration-1000 ease-out">
            <h3 className="text-[#9B1B1B] font-bold tracking-[0.2em] uppercase mb-4 text-sm">Hộp quà Cưới</h3>
            <div className="bg-white p-4 rounded-2xl shadow-md border border-gray-100 inline-block">
              <img src={invitation.bank_qr} alt="Mã QR" className="w-48 h-48 object-contain mx-auto" />
              <div className="mt-4 text-sm font-bold text-gray-800">{invitation.bank_name}</div>
              <div className="text-gray-600 font-mono mt-1">{invitation.bank_account}</div>
              <div className="text-gray-500 text-xs mt-1 uppercase">{invitation.bank_owner}</div>
            </div>
          </div>
        )}

        {/* 10. CHÂN TRANG - THANK YOU (Tinh tế, kịch xuống dưới - Yêu cầu 3) */}
        <div className="mt-24 pt-10 pb-6 text-center border-t border-[#E5C158]/30 reveal opacity-0 translate-y-12 transition-all duration-1000 ease-out">
          <h2 className="text-4xl text-[#9B1B1B] mb-2" style={{ fontFamily: "'Playfair Display', serif", fontStyle: 'italic' }}>
            Thank You
          </h2>
          <p className="text-[10px] text-gray-400 uppercase tracking-[0.2em] mt-3">
            {invitation.bride_name} & {invitation.groom_name}
          </p>
        </div>

      </div>

      {/* AUDIO PLAYER (Góc trái) */}
      {invitation.settings?.show_music && invitation.audio_url && (
        <div className="fixed bottom-4 left-4 z-50">
          <audio autoPlay loop controls className="h-8 w-48 opacity-50 hover:opacity-100 transition-opacity rounded-full shadow-lg">
            <source src={invitation.audio_url} type="audio/mpeg" />
          </audio>
        </div>
      )}

    </div>
  );
}