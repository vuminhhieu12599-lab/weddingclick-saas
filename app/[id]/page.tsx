"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "../../lib/supabase";
import { useParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

export default function InvitationPage() {
  const params = useParams();
  const id = params.id;
  
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isOpened, setIsOpened] = useState(false);
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });

  // State Form Lời Chúc
  const [guestName, setGuestName] = useState("");
  const [attendance, setAttendance] = useState("Có tham dự");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [wishStatus, setWishStatus] = useState("");

  // State Nhạc, Modal Mừng Cưới & Copy
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showGiftModal, setShowGiftModal] = useState(false);
  const [copied, setCopied] = useState(false); // State quản lý nút Copy

  useEffect(() => {
    const fetchData = async () => {
      // Gọi dữ liệu từ bảng mới 'invitations'
      const { data: wedData, error } = await supabase.from("invitations").select("*").eq("id", id).single();
      if (!error && wedData) setData(wedData);
      setLoading(false);
    };
    fetchData();
  }, [id]);

  useEffect(() => {
    if (!data || !data.settings?.show_countdown) return;
    
    // Tính toán đếm ngược dựa trên ngày lễ chính
    let targetTime = new Date("2026-11-09T08:00:00").getTime();
    if (data.wedding_date && data.wedding_date.includes('.')) {
      const parts = data.wedding_date.split('.');
      if (parts.length === 3) {
        targetTime = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T08:00:00`).getTime();
      }
    }

    const interval = setInterval(() => {
      const now = new Date().getTime();
      const difference = targetTime - now;
      if (difference > 0) {
        setTimeLeft({
          days: Math.floor(difference / (1000 * 60 * 60 * 24)),
          hours: Math.floor((difference / (1000 * 60 * 60)) % 24),
          minutes: Math.floor((difference / 1000 / 60) % 60),
          seconds: Math.floor((difference / 1000) % 60),
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [data]);

  const handleOpenCard = () => {
    setIsOpened(true);
    if (data?.settings?.show_music && audioRef.current) {
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => console.log("Trình duyệt chặn autoplay"));
    }
  };

  const toggleAudio = () => {
    if (audioRef.current) {
      if (isPlaying) audioRef.current.pause();
      else audioRef.current.play();
      setIsPlaying(!isPlaying);
    }
  };

  const handleCopySTK = () => {
    if (data?.bank_account) {
      navigator.clipboard.writeText(data.bank_account);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000); // Tự động reset chữ "Đã Copy" sau 2 giây
    }
  };

  const handleWishSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestName.trim()) return;
    setSubmitting(true);
    setWishStatus("Đang gửi...");

    // Cần đảm bảo bạn có bảng 'wishes' trên Supabase để nhận lời chúc
    const { error } = await supabase.from("wishes").insert([{
      wedding_id: id,
      guest_name: guestName,
      attendance: attendance,
      message: message
    }]);

    if (error) {
      setWishStatus("Lỗi: " + error.message);
    } else {
      setWishStatus("🎉 Cảm ơn lời chúc của bạn!");
      setGuestName(""); setMessage("");
    }
    setSubmitting(false);
  };

  if (loading) return <div className="h-screen flex items-center justify-center text-[#9B1B1B] bg-[#FDFBF7] font-serif italic">Đang chuẩn bị thiệp...</div>;
  if (!data) return <div className="h-screen flex flex-col items-center justify-center bg-[#FDFBF7] text-gray-800 font-serif"><div className="text-4xl mb-4">🌿</div><h2 className="text-xl text-[#9B1B1B] font-bold mb-2">Không tìm thấy thiệp cưới</h2><p className="text-sm text-gray-500">Đường link không tồn tại hoặc đã bị xóa.</p></div>;

  // --- XỬ LÝ LỊCH CHO NGÀY CƯỚI CHÍNH ---
  let day = "09", month = "11", year = "2026";
  let dayOfWeek = "Chủ Nhật";
  if (data.wedding_date && data.wedding_date.includes('.')) {
    const parts = data.wedding_date.split('.');
    if (parts.length === 3) {
      day = parts[0]; month = parts[1]; year = parts[2];
      const dateObj = new Date(`${year}-${month}-${day}`);
      const daysStr = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
      if (!isNaN(dateObj.getTime())) dayOfWeek = daysStr[dateObj.getDay()];
    }
  }
  const numYear = parseInt(year); const numMonth = parseInt(month); const numDay = parseInt(day);
  const firstDay = new Date(numYear, numMonth - 1, 1).getDay();
  const daysInMonth = new Date(numYear, numMonth, 0).getDate();
  const startOffset = firstDay === 0 ? 6 : firstDay - 1;
  const blanks = Array.from({ length: startOffset }, (_, i) => i);
  const daysList = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  // --- KIỂM TRA SETTINGS & ẢNH ---
  const settings = data.settings || { show_music: true, show_countdown: true, show_album: true, show_rsvp: true, show_gift: true };
  const isBrideFirst = data.invitation_type === "NHA_GAI";
  const eventName = data.invitation_type === "NHA_GAI" ? "Lễ Vu Quy" : (data.invitation_type === "NHA_TRAI" ? "Lễ Thành Hôn" : "Tiệc Mừng Lễ Thành Hôn");
  
  // Tên hiển thị (Tự đảo thứ tự)
  const name1 = isBrideFirst ? data.bride_name : data.groom_name;
  const name2 = isBrideFirst ? data.groom_name : data.bride_name;

  // Xử lý Ảnh
  const defaultPhoto = "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=600&q=80";
  const coverPhoto = data.cover_photo || defaultPhoto;
  const trioPhotos = data.trio_photos ? data.trio_photos.split(',').map((p: string) => p.trim()) : [defaultPhoto, defaultPhoto, defaultPhoto];
  const albumPhotos = data.wedding_photos ? data.wedding_photos.split(',').map((p: string) => p.trim()).filter((p: string) => p) : [];

  return (
    <div className="relative min-h-screen bg-[#FDFBF7] text-gray-800 overflow-x-hidden flex justify-center" style={{ fontFamily: "'Playfair Display', serif" }}>
      
      {settings.show_music && (
        <audio ref={audioRef} loop src={data.audio_url || "https://res.cloudinary.com/djp3zks6d/video/upload/v1723555234/Beautiful-In-White_nvqwk5.mp3"} />
      )}

      {/* KHUNG THIỆP CHÍNH */}
      <div className="max-w-md w-full bg-white min-h-screen relative shadow-2xl overflow-hidden">
        
        {/* NÚT BẬT TẮT NHẠC */}
        <AnimatePresence>
          {isOpened && settings.show_music && (
            <motion.button
              initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 1 }} onClick={toggleAudio}
              className={`fixed bottom-6 ml-4 z-50 w-10 h-10 rounded-full flex items-center justify-center shadow-lg border border-[#E5C158] transition-all duration-300 ${isPlaying ? 'bg-white text-[#9B1B1B]' : 'bg-gray-200 text-gray-500'}`}
            >
              <span className={isPlaying ? "animate-spin-slow" : ""}>{isPlaying ? "🎵" : "🔇"}</span>
            </motion.button>
          )}
        </AnimatePresence>

        {/* BÌA THIỆP MỞ */}
        <AnimatePresence>
          {!isOpened && (
            <motion.div exit={{ opacity: 0 }} transition={{ duration: 0.8 }} className="fixed inset-0 z-50 flex justify-center items-center w-full h-full pointer-events-none">
              <div className="max-w-md w-full h-full relative overflow-hidden pointer-events-auto cursor-pointer shadow-2xl bg-[#9B1B1B]" onClick={handleOpenCard}>
                <motion.div initial={{ x: 0 }} exit={{ x: "-100%" }} transition={{ duration: 1.5, ease: [0.22, 1, 0.36, 1] }} className="absolute inset-y-0 left-0 w-1/2 bg-[#9B1B1B] border-r border-red-800/50" />
                <motion.div initial={{ x: 0 }} exit={{ x: "100%" }} transition={{ duration: 1.5, ease: [0.22, 1, 0.36, 1] }} className="absolute inset-y-0 right-0 w-1/2 bg-[#9B1B1B] border-l border-red-500/30" />
                <motion.div exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.5 }} className="absolute inset-0 flex flex-col justify-center items-center text-center text-[#E5C158] px-6 z-10 pointer-events-none">
                   <h2 className="text-xs tracking-[0.4em] uppercase opacity-90 font-semibold mb-10">Thiệp Mời Cưới</h2>
                   <div className="space-y-4 mb-10" style={{ fontFamily: "'Dancing Script', cursive" }}>
                     <div className="text-4xl">{name1}</div>
                     <div className="text-2xl text-[#E5C158]/80">&</div> 
                     <div className="text-4xl">{name2}</div>
                   </div>
                   <div className="text-[100px] font-bold mb-10 opacity-90">囍</div>
                   <div className="absolute bottom-12 text-sm font-serif italic opacity-70 animate-pulse">Chạm để mở thiệp</div>
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* HOẠ TIẾT VIỀN */}
        <div className="absolute left-0 top-0 bottom-0 w-3 bg-[repeating-linear-gradient(0deg,#E5C158,#E5C158_10px,#FFF_10px,#FFF_20px)] border-r border-yellow-200 z-20 pointer-events-none opacity-90"></div>
        <div className="absolute right-0 top-0 bottom-0 w-3 bg-[repeating-linear-gradient(0deg,#E5C158,#E5C158_10px,#FFF_10px,#FFF_20px)] border-l border-yellow-200 z-20 pointer-events-none opacity-90"></div>

        <div className="pt-20 px-6 relative z-10">
          
          {/* PHẦN TIÊU ĐỀ CHÍNH & ẢNH BÌA */}
          <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1.2, ease: "easeOut", delay: 0.3 }} className="text-center mb-16 relative">
            <h2 className="text-xs tracking-[0.3em] text-gray-600 uppercase mb-3 font-semibold">THIỆP MỜI</h2>
            <h1 className="text-4xl text-gray-900 mb-4" style={{ fontFamily: "'Dancing Script', cursive" }}>{name1} <span className="text-2xl text-gray-400">&</span> {name2}</h1>
            <div className="text-4xl text-[#9B1B1B] font-bold my-3 select-none">囍</div>
            
            <p className="text-xs uppercase tracking-widest font-bold text-gray-700 mb-1">{data.wedding_time}</p>
            <p className="text-xl font-bold tracking-[0.15em] text-gray-900 mb-8">{data.wedding_date}</p>
            
            <div className="relative mx-auto max-w-[280px] p-2 bg-white border-2 border-[#9B1B1B] shadow-lg rounded-sm">
              <div className="aspect-[3/4] overflow-hidden bg-gray-100"><img src={coverPhoto} alt="Cover" className="w-full h-full object-cover" /></div>
              <div className="absolute -bottom-4 -right-4 text-3xl select-none pointer-events-none">🏮</div>
              <div className="absolute -bottom-3 right-6 text-2xl select-none pointer-events-none">🏮</div>
            </div>
          </motion.div>

          {/* GIA ĐÌNH HAI BÊN */}
          <motion.div initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} transition={{ duration: 1, ease: "easeOut" }} viewport={{ once: true, margin: "-50px" }} className="text-center mb-16 border-t border-b border-[#E5C158]/50 py-8 relative">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className={isBrideFirst ? "order-2" : "order-1"}>
                <p className="font-bold mb-3 tracking-widest text-gray-500 text-xs">NHÀ TRAI</p>
                <p className="font-bold text-[#9B1B1B] mb-2 uppercase text-xs">{data.groom_father || "Bố Chú Rể"}</p>
                <p className="font-bold text-[#9B1B1B] uppercase text-xs">{data.groom_mother || "Mẹ Chú Rể"}</p>
              </div>
              <div className={isBrideFirst ? "order-1" : "order-2"}>
                <p className="font-bold mb-3 tracking-widest text-gray-500 text-xs">NHÀ GÁI</p>
                <p className="font-bold text-[#9B1B1B] mb-2 uppercase text-xs">{data.bride_father || "Bố Cô Dâu"}</p>
                <p className="font-bold text-[#9B1B1B] uppercase text-xs">{data.bride_mother || "Mẹ Cô Dâu"}</p>
              </div>
            </div>
          </motion.div>

          {/* LỜI MỜI & BỘ 3 ẢNH */}
          <motion.div initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} transition={{ duration: 1, ease: "easeOut" }} viewport={{ once: true, margin: "-50px" }} className="text-center mb-16">
            <div className="flex items-center justify-center gap-3 mb-4 text-[#E5C158]"><span className="w-12 h-[1px] bg-[#E5C158]"></span><span className="text-lg">❀</span><span className="w-12 h-[1px] bg-[#E5C158]"></span></div>
            <p className="text-gray-700 italic text-base mb-6" style={{ fontFamily: "'Dancing Script', cursive", fontSize: "24px" }}>Trân Trọng Kính Mời</p>
            
            <div className="grid grid-cols-3 gap-2 items-center mb-8 px-2">
              <motion.div initial={{ opacity: 0, scale: 0.8 }} whileInView={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8, delay: 0.2 }} viewport={{ once: true }} className="aspect-[3/4] rounded-md overflow-hidden shadow-md bg-gray-100 transform -rotate-2"><img src={trioPhotos[0] || coverPhoto} className="w-full h-full object-cover" /></motion.div>
              <motion.div initial={{ opacity: 0, scale: 0.8 }} whileInView={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8, delay: 0.4 }} viewport={{ once: true }} className="aspect-[3/4] rounded-md overflow-hidden shadow-lg bg-gray-100 z-10 scale-105 border border-[#E5C158]"><img src={trioPhotos[1] || coverPhoto} className="w-full h-full object-cover" /></motion.div>
              <motion.div initial={{ opacity: 0, scale: 0.8 }} whileInView={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8, delay: 0.6 }} viewport={{ once: true }} className="aspect-[3/4] rounded-md overflow-hidden shadow-md bg-gray-100 transform rotate-2"><img src={trioPhotos[2] || coverPhoto} className="w-full h-full object-cover" /></motion.div>
            </div>
            
            <div className="mb-6">
              <h3 className="text-xs uppercase tracking-[0.2em] font-bold text-gray-800 mb-1">{eventName}</h3>
              <p className="text-xs text-gray-500 mb-6">Vào Lúc</p>
              
              <div className="flex justify-center items-center gap-4 text-gray-800 my-4">
                <span className="text-sm font-semibold tracking-wider">{data.wedding_time}</span>
                <div className="w-[1px] h-12 bg-gray-300"></div>
                <div className="text-center px-2">
                  <p className="text-xs uppercase text-gray-500">{dayOfWeek}</p>
                  <p className="text-3xl font-bold text-gray-900 my-0.5">{day}</p>
                  <p className="text-xs uppercase text-gray-500">Tháng {month}</p>
                </div>
                <div className="w-[1px] h-12 bg-gray-300"></div>
                <span className="text-sm font-semibold tracking-wider">Năm {year}</span>
              </div>
              <p className="text-xs text-gray-500 italic mt-3">({data.lunar_date || "Tức Ngày..."})</p>
            </div>
          </motion.div>

          {/* ĐỊA ĐIỂM TỔ CHỨC */}
          <motion.div initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} transition={{ duration: 1, ease: "easeOut" }} viewport={{ once: true, margin: "-50px" }} className="text-center mb-16">
            <h3 className="text-xs uppercase tracking-[0.2em] font-bold text-gray-800 mb-4">Buổi tiệc được tổ chức tại</h3>
            <div className="bg-white py-5 px-6 rounded-2xl border-2 border-[#9B1B1B] shadow-md max-w-[90%] mx-auto flex flex-col items-center">
              <p className="font-bold text-xl text-[#9B1B1B] mb-2">{data.location_name || "Tư Gia"}</p>
              <p className="text-sm text-gray-700 mb-5 leading-relaxed">{data.wedding_address}</p>
              {data.map_link && <a href={data.map_link} target="_blank" rel="noopener noreferrer" className="bg-[#9B1B1B] text-white px-8 py-2.5 rounded-full font-bold inline-block hover:bg-red-800 transition shadow-md tracking-wider text-xs">Xem Chỉ Đường</a>}
            </div>
          </motion.div>

          {/* MODULE: ĐẾM NGƯỢC */}
          {settings.show_countdown && (
            <motion.div initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} transition={{ duration: 1, ease: "easeOut" }} viewport={{ once: true, margin: "-50px" }} className="mb-16">
              <div className="bg-[#9B1B1B] text-white p-5 rounded-2xl shadow-lg text-center border-2 border-[#E5C158]">
                <p className="text-xs uppercase tracking-[0.25em] text-[#E5C158] mb-3 font-semibold">Đếm ngược ngày chung đôi</p>
                <div className="grid grid-cols-4 gap-2 text-center">
                  <div className="bg-white/10 p-2 rounded-lg backdrop-blur-sm"><span className="text-xl font-bold block">{timeLeft.days}</span><span className="text-[9px] uppercase tracking-wider text-gray-200">Ngày</span></div>
                  <div className="bg-white/10 p-2 rounded-lg backdrop-blur-sm"><span className="text-xl font-bold block">{timeLeft.hours}</span><span className="text-[9px] uppercase tracking-wider text-gray-200">Giờ</span></div>
                  <div className="bg-white/10 p-2 rounded-lg backdrop-blur-sm"><span className="text-xl font-bold block">{timeLeft.minutes}</span><span className="text-[9px] uppercase tracking-wider text-gray-200">Phút</span></div>
                  <div className="bg-white/10 p-2 rounded-lg backdrop-blur-sm"><span className="text-xl font-bold block">{timeLeft.seconds}</span><span className="text-[9px] uppercase tracking-wider text-gray-200">Giây</span></div>
                </div>
              </div>
            </motion.div>
          )}

          {/* LỊCH NGÀY CƯỚI */}
          <motion.div initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} transition={{ duration: 1, ease: "easeOut" }} viewport={{ once: true, margin: "-50px" }} className="mb-16">
            <h3 className="text-2xl text-center mb-6 text-[#9B1B1B] font-bold uppercase tracking-widest">Tháng {month} - {year}</h3>
            <div className="border border-[#9B1B1B] p-5 bg-white shadow-sm relative">
              <div className="grid grid-cols-7 text-center font-bold text-sm mb-4 text-gray-800"><div>T2</div><div>T3</div><div>T4</div><div>T5</div><div>T6</div><div>T7</div><div className="text-red-500">CN</div></div>
              <div className="grid grid-cols-7 text-center text-sm gap-y-4">
                {blanks.map(b => <div key={`blank-${b}`}></div>)}
                {daysList.map(d => (
                  <div key={d} className="relative flex justify-center items-center">
                    <span className={`z-10 ${d === numDay ? 'text-white font-bold' : 'text-gray-600'}`}>{d}</span>
                    {d === numDay && <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 1, type: "spring" }} className="absolute w-8 h-8 bg-[#9B1B1B] rounded-full z-0 flex items-center justify-center shadow-md"></motion.div>}
                  </div>
                ))}
              </div>
            </div>
          </motion.div>

          {/* MODULE: FORM RSVP */}
          {settings.show_rsvp && (
            <motion.div initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} transition={{ duration: 1, ease: "easeOut" }} viewport={{ once: true, margin: "-50px" }} className="bg-[#9B1B1B] p-6 rounded-2xl shadow-xl text-white mb-10">
              <h3 className="text-3xl text-center mb-2" style={{ fontFamily: "'Dancing Script', cursive" }}>Xác Nhận Tham Dự</h3>
              <form onSubmit={handleWishSubmit} className="space-y-4 mt-4">
                <input type="text" value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Nhập họ tên..." className="w-full bg-white/10 border border-white/20 p-3 rounded-lg text-white placeholder-gray-400 focus:outline-none text-sm" required />
                <select value={attendance} onChange={(e) => setAttendance(e.target.value)} className="w-full bg-red-900 border border-white/20 p-3 rounded-lg text-white focus:outline-none text-sm"><option value="Có tham dự">Chắc chắn tôi sẽ tham dự 🥰</option><option value="Không tham dự">Rất tiếc vì vắng mặt 😢</option></select>
                <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Lời chúc..." rows={3} className="w-full bg-white/10 border border-white/20 p-3 rounded-lg text-white placeholder-gray-400 focus:outline-none text-sm"></textarea>
                <motion.button whileHover={{ scale: 1.02 }} type="submit" className="w-full bg-[#E5C158] text-[#9B1B1B] font-bold py-3 rounded-lg hover:bg-yellow-400 transition uppercase text-sm">{submitting ? "Đang gửi..." : "Gửi Lời Chúc"}</motion.button>
                {wishStatus && <p className="text-center text-xs text-yellow-300 font-semibold mt-2">{wishStatus}</p>}
              </form>
            </motion.div>
          )}

          {/* MODULE: GỬI MỪNG CƯỚI */}
          {settings.show_gift && (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} className="text-center mb-16">
              <button onClick={() => setShowGiftModal(true)} className="bg-white border-2 border-[#9B1B1B] text-[#9B1B1B] px-8 py-3 rounded-full font-bold inline-flex items-center gap-2 hover:bg-[#9B1B1B] hover:text-white transition shadow-md tracking-wider text-sm">
                🎁 Gửi Mừng Cưới
              </button>
            </motion.div>
          )}

          {/* MODULE: ALBUM ẢNH */}
          {settings.show_album && albumPhotos.length > 0 && (
            <div className="text-center mb-16">
              <h3 className="text-3xl text-[#9B1B1B] mb-2" style={{ fontFamily: "'Dancing Script', cursive" }}>Album Ảnh Cưới</h3>
              <div className="grid grid-cols-2 gap-3 mt-4">
                {albumPhotos.map((photo: string, index: number) => (
                  <motion.div key={index} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="rounded-xl overflow-hidden shadow-md aspect-[3/4]">
                    <img src={photo} className="w-full h-full object-cover" loading="lazy" />
                  </motion.div>
                ))}
              </div>
            </div>
          )}

          {/* FOOTER */}
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} transition={{ duration: 1, ease: "easeOut" }} viewport={{ once: true }} className="text-center pb-12 pt-4 relative">
            <div className="flex items-center justify-center gap-3 mb-6 opacity-50"><span className="w-12 h-[1px] bg-[#9B1B1B]"></span><span className="text-[#9B1B1B] text-lg">❀</span><span className="w-12 h-[1px] bg-[#9B1B1B]"></span></div>
            <h2 className="text-5xl text-[#9B1B1B] mb-2 drop-shadow-sm" style={{ fontFamily: "'Dancing Script', cursive" }}>Thank You!</h2>
            <p className="text-xs uppercase tracking-[0.2em] text-gray-500 mb-6 font-semibold">Chân thành cảm ơn</p>
            <div className="text-2xl text-[#9B1B1B] opacity-90" style={{ fontFamily: "'Dancing Script', cursive" }}>
              {name1} <span className="text-xl text-gray-400 mx-1">&</span> {name2}
            </div>
          </motion.div>

        </div>
      </div>

      {/* POPUP MÃ QR MỪNG CƯỚI (Đã tích hợp Logic Copy & Ẩn hiện Text) */}
      <AnimatePresence>
        {showGiftModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
            <motion.div initial={{ scale: 0.8, y: 50 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.8, opacity: 0 }} className="bg-white rounded-2xl p-6 relative w-full max-w-xs text-center shadow-2xl border-2 border-[#E5C158]">
              <button onClick={() => setShowGiftModal(false)} className="absolute top-2 right-4 text-gray-400 hover:text-red-600 text-3xl leading-none">&times;</button>
              
              <h3 className="text-2xl text-[#9B1B1B] mb-1 mt-2" style={{ fontFamily: "'Dancing Script', cursive" }}>Gửi Mừng Cưới</h3>
              <p className="text-[10px] uppercase tracking-widest text-gray-500 mb-4">Chân thành cảm ơn bạn!</p>
              
              {/* Ảnh QR (Mặc định hiện) */}
              <div className="bg-gray-50 p-2 rounded-xl border border-gray-200 inline-block w-full">
                <img src={data?.bank_qr || "https://api.vietqr.io/image/970436-123456789-Vnpay.jpg"} alt="Mã QR Ngân Hàng" className="w-full h-auto mx-auto rounded-lg object-contain" />
              </div>

              {/* Box Copy STK (Chỉ hiện khi Admin có nhập thông tin) */}
              {(data?.bank_account || data?.bank_name || data?.bank_owner) && (
                <div className="mt-4 border-t border-gray-100 pt-4">
                  {data?.bank_name && <div className="text-sm font-bold text-gray-800 mb-1">{data.bank_name}</div>}
                  {data?.bank_owner && <div className="text-xs text-gray-600 mb-1">Tên TK: {data.bank_owner}</div>}
                  
                  {data?.bank_account && (
                    <div className="text-xs text-gray-600 mb-5">
                      STK: <span className="font-bold text-base text-[#9B1B1B] ml-1 tracking-wider">{data.bank_account}</span>
                    </div>
                  )}
                  
                  {data?.bank_account && (
                    <button 
                      onClick={handleCopySTK} 
                      className={`w-full font-bold py-3 rounded-full transition shadow-md text-sm ${copied ? 'bg-green-500 text-white' : 'bg-[#E5C158] text-[#9B1B1B] hover:bg-yellow-400'}`}
                    >
                      {copied ? "✔️ Đã Copy STK" : "Copy Số Tài Khoản"}
                    </button>
                  )}
                </div>
              )}

            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}