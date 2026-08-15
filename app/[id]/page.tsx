"use client";

import { useEffect, useState } from "react";
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

  // Bộ theo dõi hiệu ứng trượt mượt mà (Scroll Animation)
  useEffect(() => {
    if (loading || !invitation) return;
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('active');
        }
      });
    }, { threshold: 0.1 });

    document.querySelectorAll('.reveal, .reveal-left, .reveal-right').forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [loading, invitation]);

  // Logic Đếm ngược
  useEffect(() => {
    if (!invitation?.wedding_date) return;
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
    await supabase.from('wishes').insert([{ wedding_id: id, guest_name: rsvpName, attendance, message }]);
    setIsSubmitting(false);
    setRsvpSuccess(true);
  };

  const handleCopyBank = () => {
    navigator.clipboard.writeText(invitation.bank_account);
    alert("Đã sao chép số tài khoản!");
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-[#FDFBF7] text-[#9B1B1B] font-bold">Đang tải thiệp...</div>;
  if (!invitation) return <div className="min-h-screen flex items-center justify-center bg-[#FDFBF7] text-gray-500">Không tìm thấy thiệp cưới!</div>;

  // Logic Xử lý Tên Loại Tiệc theo yêu cầu
  let eventTitle = "Tiệc mừng Lễ Thành Hôn";
  if (invitation.invitation_type === 'NHA_GAI') eventTitle = "Tiệc mừng Lễ Vu Quy";

  return (
    <div className="min-h-screen bg-[#FDFBF7] font-sans text-gray-800 relative overflow-x-hidden">
      
      {/* KHAI BÁO CSS HIỆU ỨNG TRƯỢT */}
      <style dangerouslySetInnerHTML={{__html: `
        .reveal { opacity: 0; transform: translateY(30px); transition: all 0.8s ease-out; }
        .reveal.active { opacity: 1; transform: translateY(0); }
        
        .reveal-left { opacity: 0; transform: translateX(-40px); transition: all 0.8s ease-out; }
        .reveal-left.active { opacity: 1; transform: translateX(0); }
        
        .reveal-right { opacity: 0; transform: translateX(40px); transition: all 0.8s ease-out; }
        .reveal-right.active { opacity: 1; transform: translateX(0); }
      `}} />

      {/* Viền trang trí 2 bên */}
      <div className="fixed top-0 bottom-0 left-0 w-3 md:w-5 bg-[url('https://www.transparenttextures.com/patterns/gold-scale.png')] bg-[#E5C158]/80 z-50"></div>
      <div className="fixed top-0 bottom-0 right-0 w-3 md:w-5 bg-[url('https://www.transparenttextures.com/patterns/gold-scale.png')] bg-[#E5C158]/80 z-50"></div>

      <div className="max-w-md mx-auto relative z-10 pt-16 pb-10 px-6 sm:px-8 bg-white/70 min-h-screen shadow-xl shadow-[#E5C158]/10 flex flex-col items-center">
        
        {/* LỜI CHÀO GUEST VIP */}
        {guestName && (
          <div className="text-center mb-8 reveal w-full">
            <p className="text-sm text-gray-500 font-medium">Trân trọng kính mời</p>
            <h2 className="text-2xl font-bold text-[#9B1B1B] mt-1" style={{ fontFamily: "'Playfair Display', serif" }}>{guestName}</h2>
          </div>
        )}

        {/* 1. KHỐI TIÊU ĐỀ & NGÀY GIỜ TRÊN CÙNG (Giữ nguyên logic cũ) */}
        <div className="text-center reveal w-full">
          <h3 className="text-[10px] font-bold tracking-[0.3em] text-gray-400 uppercase mb-4">Thiệp Mời</h3>
          <h1 className="text-4xl sm:text-5xl font-bold text-[#1a2b4c]" style={{ fontFamily: "'Playfair Display', serif" }}>
            {invitation.bride_name} <span className="text-[#E5C158] italic mx-1">&</span> {invitation.groom_name}
          </h1>
          <div className="text-[#9B1B1B] text-4xl mt-4 mb-2">囍</div>
          
          <div className="mt-2 mb-6 text-[#1a2b4c]">
            <p className="text-sm font-bold tracking-widest uppercase mb-1">{invitation.wedding_time}</p>
            <p className="text-xl font-bold tracking-widest">{invitation.wedding_date}</p>
          </div>
        </div>

        {/* 2. ẢNH BÌA (Phóng to tràn ngang) */}
        <div className="w-full relative reveal">
          <div className="w-full aspect-[4/5] p-1.5 bg-white border border-[#9B1B1B]/30 shadow-lg relative rounded-sm">
            <img src={invitation.cover_photo} alt="Cover" className="w-full h-full object-cover rounded-sm" />
          </div>
        </div>

        {/* 3. ĐẾM NGƯỢC (Chuyển lên ngay dưới ảnh bìa) */}
        {invitation.settings?.show_countdown && (
          <div className="w-full mt-10 reveal">
            <p className="text-center text-xs font-bold text-gray-400 uppercase tracking-[0.2em] mb-4">Cùng đếm ngược</p>
            <div className="flex justify-center gap-4">
              {[
                { label: 'Ngày', value: timeLeft.days },
                { label: 'Giờ', value: timeLeft.hours },
                { label: 'Phút', value: timeLeft.minutes },
                { label: 'Giây', value: timeLeft.seconds },
              ].map((item, idx) => (
                <div key={idx} className="w-14 h-14 rounded-full border border-[#E5C158] flex flex-col items-center justify-center bg-white shadow-sm">
                  <span className="text-lg font-bold text-[#9B1B1B] leading-none">{item.value}</span>
                  <span className="text-[8px] text-gray-500 uppercase tracking-widest mt-1">{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 4. TIỆC MỪNG & CHI TIẾT THỜI GIAN */}
        <div className="w-full mt-16 reveal text-center">
          <h2 className="text-[#9B1B1B] font-bold text-lg tracking-[0.1em] uppercase mb-6">
            {eventTitle}
          </h2>

          <div className="border-t border-b border-[#E5C158]/50 py-6 mx-4 relative">
            <div className="text-4xl font-bold text-[#1a2b4c] mb-2" style={{ fontFamily: "'Playfair Display', serif" }}>
              {invitation.wedding_time}
            </div>
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-[0.3em] mb-2">Ngày</div>
            <div className="text-2xl font-bold text-[#1a2b4c] tracking-wider mb-2">
              {invitation.wedding_date}
            </div>
            <div className="text-xs text-gray-500 italic">
              (Tức {invitation.lunar_date})
            </div>
          </div>
        </div>

        {/* 5. GIA ĐÌNH HAI BÊN */}
        <div className="w-full mt-10 reveal text-center">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-[0.2em] mb-4">Sự hiện diện của quý vị là vinh hạnh cho gia đình chúng tôi</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="font-bold text-[#9B1B1B] text-xs tracking-widest uppercase mb-2">Nhà Trai</p>
              <p className="text-sm text-gray-700 font-medium">Ông: {invitation.groom_father}</p>
              <p className="text-sm text-gray-700 font-medium">Bà: {invitation.groom_mother}</p>
            </div>
            <div>
              <p className="font-bold text-[#9B1B1B] text-xs tracking-widest uppercase mb-2">Nhà Gái</p>
              <p className="text-sm text-gray-700 font-medium">Ông: {invitation.bride_father}</p>
              <p className="text-sm text-gray-700 font-medium">Bà: {invitation.bride_mother}</p>
            </div>
          </div>
        </div>

        {/* 6. ĐỊA ĐIỂM TỔ CHỨC */}
        <div className="w-full mt-14 text-center reveal">
          <p className="text-xs font-bold text-gray-400 uppercase tracking-[0.2em] mb-2">Địa điểm tổ chức</p>
          <p className="text-xl font-bold text-[#1a2b4c] mb-2" style={{ fontFamily: "'Playfair Display', serif" }}>{invitation.location_name}</p>
          <p className="text-sm text-gray-600 mb-6">{invitation.wedding_address}</p>
          
          {invitation.map_link && (
            <a href={invitation.map_link} target="_blank" className="inline-block border border-[#9B1B1B] text-[#9B1B1B] px-6 py-2 rounded-full text-xs font-bold uppercase tracking-widest hover:bg-[#9B1B1B] hover:text-white transition-all">
              Chỉ đường Google Maps
            </a>
          )}
        </div>

        {/* 7. ALBUM ẢNH (Hiệu ứng trượt chéo trái phải) */}
        {invitation.settings?.show_album && invitation.wedding_photos && (
          <div className="w-full mt-20">
            <h3 className="text-center text-[#9B1B1B] font-bold tracking-[0.2em] uppercase mb-8 reveal">Album Cưới</h3>
            <div className="grid grid-cols-2 gap-3">
              {invitation.wedding_photos.split(',').map((url: string, index: number) => (
                <div key={index} className={`aspect-square overflow-hidden rounded-md shadow-sm border border-gray-100 ${index % 2 === 0 ? 'reveal-left' : 'reveal-right'}`}>
                  <img src={url} alt={`Wedding ${index}`} className="w-full h-full object-cover hover:scale-110 transition-transform duration-700" />
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 8. FORM XÁC NHẬN THAM DỰ (RSVP) */}
        {invitation.settings?.show_rsvp && (
          <div className="w-full mt-20 bg-[#222425] p-8 rounded-2xl shadow-xl reveal">
            <h3 className="text-xl font-bold text-[#E5C158] text-center mb-2" style={{ fontFamily: "'Playfair Display', serif" }}>Xác Nhận Tham Dự</h3>
            <p className="text-xs text-center text-gray-400 mb-6">Sự hiện diện của bạn là niềm vinh hạnh cho gia đình chúng tôi.</p>
            
            {rsvpSuccess ? (
              <div className="bg-green-900/30 text-green-400 p-4 rounded-xl text-center font-bold border border-green-800 text-sm">
                🎉 Cảm ơn bạn đã gửi lời chúc!
              </div>
            ) : (
              <form onSubmit={handleRsvpSubmit} className="space-y-4">
                <input type="text" value={rsvpName} onChange={(e) => setRsvpName(e.target.value)} placeholder="Tên của bạn..." className="w-full border-b border-gray-600 bg-transparent py-3 text-[#FDFBF7] focus:border-[#E5C158] focus:outline-none text-sm transition-colors" required />
                <select value={attendance} onChange={(e) => setAttendance(e.target.value)} className="w-full border-b border-gray-600 bg-transparent py-3 text-[#FDFBF7] focus:border-[#E5C158] focus:outline-none text-sm transition-colors">
                  <option value="Có tham dự" className="text-gray-800">Chắc chắn tham dự</option>
                  <option value="Không tham dự" className="text-gray-800">Rất tiếc không thể tham dự</option>
                </select>
                <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Gửi lời chúc tốt đẹp nhất..." className="w-full border-b border-gray-600 bg-transparent py-3 text-[#FDFBF7] focus:border-[#E5C158] focus:outline-none text-sm transition-colors resize-none" rows={2}></textarea>
                <button type="submit" disabled={isSubmitting} className="w-full bg-[#9B1B1B] text-white py-4 rounded-xl font-bold uppercase tracking-widest text-xs hover:bg-red-800 transition-colors mt-4">
                  {isSubmitting ? "Đang gửi..." : "Gửi Xác Nhận"}
                </button>
              </form>
            )}
          </div>
        )}

        {/* 9. MÃ QR MỪNG CƯỚI (Logic gốc + nền tối) */}
        {invitation.settings?.show_gift && invitation.bank_qr && (
          <div className="w-full mt-16 text-center reveal">
            <h3 className="text-[#9B1B1B] font-bold tracking-[0.2em] uppercase mb-6 text-sm">Hộp Quà Cưới</h3>
            <div className="bg-[#222425] p-6 rounded-2xl shadow-xl border border-gray-800 mx-auto max-w-[250px]">
              <div className="bg-white p-2 rounded-lg mb-4">
                <img src={invitation.bank_qr} alt="Mã QR" className="w-full aspect-square object-contain" />
              </div>
              <div className="text-lg font-mono text-[#FDFBF7] tracking-wider flex items-center justify-center gap-2">
                {invitation.bank_account}
                <button onClick={handleCopyBank} className="text-gray-400 hover:text-[#E5C158] transition" title="Copy số tài khoản">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
              </div>
              <div className="text-gray-400 text-xs mt-1 uppercase tracking-widest">{invitation.bank_owner}</div>
            </div>
          </div>
        )}

        {/* 10. CHÂN TRANG - THANK YOU (Tinh tế, kịch đáy) */}
        <div className="w-full mt-24 pt-10 pb-4 text-center reveal">
          <h2 className="text-3xl text-[#9B1B1B] mb-2 opacity-80" style={{ fontFamily: "'Playfair Display', serif", fontStyle: 'italic' }}>
            Thank You
          </h2>
          <div className="w-12 h-px bg-[#E5C158]/50 mx-auto mt-4"></div>
        </div>

      </div>

      {/* ÂM NHẠC */}
      {invitation.settings?.show_music && invitation.audio_url && (
        <div className="fixed bottom-4 left-4 z-50">
          <audio autoPlay loop controls className="h-8 w-48 opacity-30 hover:opacity-100 transition-opacity rounded-full shadow-lg">
            <source src={invitation.audio_url} type="audio/mpeg" />
          </audio>
        </div>
      )}

    </div>
  );
}