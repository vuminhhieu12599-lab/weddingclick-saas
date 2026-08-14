"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { supabase } from "../../lib/supabase";
import { useParams, useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";

// --- COMPONENT HIỆU ỨNG HOA ĐÀO RƠI ---
const FallingPetals = () => {
  return (
    <div className="fixed inset-0 pointer-events-none z-40 overflow-hidden" aria-hidden="true">
      {[...Array(15)].map((_, i) => (
        <div key={i} className="absolute w-3 h-3 bg-pink-200 rounded-full opacity-60 shadow-sm animate-fall"
             style={{
               left: `${Math.random() * 100}vw`,
               animationDuration: `${Math.random() * 3 + 5}s`,
               animationDelay: `${Math.random() * 5}s`
             }}
        />
      ))}
      <style>{`
        @keyframes fall {
          0% { transform: translateY(-10vh) rotate(0deg) scale(0.5); opacity: 0; }
          20% { opacity: 0.8; }
          100% { transform: translateY(110vh) rotate(360deg) scale(1); opacity: 0.2; }
        }
        .animate-fall { animation: fall linear infinite; }
      `}</style>
    </div>
  );
};

// --- COMPONENT NỘI DUNG CHÍNH CỦA THIỆP ---
function InvitationContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const id = params.id;
  
  // Lấy tên khách mời từ tham số URL (?n=...)
  const vipName = searchParams.get("n"); 
  
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isOpened, setIsOpened] = useState(false);
  const [timeLeft, setTimeLeft] = useState({ days: 0, hours: 0, minutes: 0, seconds: 0 });

  // RSVP State
  const [guestName, setGuestName] = useState("");
  const [attendance, setAttendance] = useState("Có tham dự");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [wishStatus, setWishStatus] = useState("");

  // Music & Modal
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showGiftModal, setShowGiftModal] = useState(false);
  const [copied, setCopied] = useState(false);

  // Album Likes State
  const [likedPhotos, setLikedPhotos] = useState<Record<number, boolean>>({});

  useEffect(() => {
    const fetchData = async () => {
      const { data: wedData } = await supabase.from("invitations").select("*").eq("id", id).single();
      if (wedData) setData(wedData);
      setLoading(false);
    };
    fetchData();
  }, [id]);

  useEffect(() => {
    if (!data || !data.settings?.show_countdown) return;
    // Xử lý chuỗi ngày tháng để tính countdown (VD: 10.10.2026)
    let targetTime = new Date("2026-11-09T08:00:00").getTime();
    if (data.wedding_date && data.wedding_date.includes('.')) {
      const parts = data.wedding_date.split('.');
      if (parts.length === 3) targetTime = new Date(`${parts[2]}-${parts[1]}-${parts[0]}T08:00:00`).getTime();
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
      audioRef.current.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  };

  const toggleAudio = () => {
    if (audioRef.current) {
      if (isPlaying) audioRef.current.pause(); else audioRef.current.play();
      setIsPlaying(!isPlaying);
    }
  };

  const handleCopySTK = () => {
    if (data?.bank_account) {
      navigator.clipboard.writeText(data.bank_account);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleWishSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestName.trim()) return;
    setSubmitting(true);
    setWishStatus("Đang gửi...");
    const { error } = await supabase.from("wishes").insert([{ wedding_id: id, guest_name: guestName, attendance: attendance, message: message }]);
    if (error) setWishStatus("Lỗi: " + error.message);
    else { setWishStatus("🎉 Cảm ơn lời chúc của bạn!"); setGuestName(""); setMessage(""); }
    setSubmitting(false);
  };

  const toggleLike = (index: number) => {
    setLikedPhotos(prev => ({ ...prev, [index]: !prev[index] }));
  };

  if (loading) return <div className="h-screen flex items-center justify-center text-[#9B1B1B] bg-[#FDFBF7] font-bold">Đang tải thiệp...</div>;
  if (!data) return <div className="h-screen flex flex-col items-center justify-center bg-[#FDFBF7]">Không tìm thấy thiệp cưới.</div>;

  const settings = data.settings || {};
  // Mặc định luôn bật hiệu ứng cánh hoa (nếu chưa có trong thiết lập)
  const showEffect = settings.show_effect !== false; 
  
  const isBrideFirst = data.invitation_type === "NHA_GAI";
  const name1 = isBrideFirst ? data.bride_name : data.groom_name;
  const name2 = isBrideFirst ? data.groom_name : data.bride_name;
  
  const coverPhoto = data.cover_photo || "https://images.unsplash.com/photo-1519741497674-611481863552?auto=format&fit=crop&w=600&q=80";
  const trioPhotos = data.trio_photos ? data.trio_photos.split(',').filter(Boolean) : [coverPhoto, coverPhoto, coverPhoto];
  const albumPhotos = data.wedding_photos ? data.wedding_photos.split(',').filter(Boolean) : [];

  return (
    <div className="relative min-h-screen bg-[#FDFBF7] text-gray-800 flex justify-center overflow-x-hidden" style={{ fontFamily: "'Playfair Display', serif" }}>
      
      {/* 🎵 MODULE NHẠC NỀN */}
      {settings.show_music && <audio ref={audioRef} loop src={data.audio_url || "https://res.cloudinary.com/djp3zks6d/video/upload/v1723555234/Beautiful-In-White_nvqwk5.mp3"} />}

      <div className="max-w-md w-full bg-white min-h-screen relative shadow-2xl overflow-hidden">
        
        {/* HIỆU ỨNG CÁNH HOA ĐÀO */}
        {isOpened && showEffect && <FallingPetals />}

        <AnimatePresence>
          {isOpened && settings.show_music && (
            <motion.button initial={{ opacity: 0, scale: 0 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 1 }} onClick={toggleAudio} className={`fixed bottom-6 ml-4 z-50 w-10 h-10 rounded-full flex items-center justify-center shadow-lg border border-[#E5C158] ${isPlaying ? 'bg-white text-[#9B1B1B]' : 'bg-gray-200 text-gray-500'}`}>
              <span className={isPlaying ? "animate-spin-slow" : ""}>{isPlaying ? "🎵" : "🔇"}</span>
            </motion.button>
          )}
        </AnimatePresence>

        {/* BÌA THƯ BÊN NGOÀI */}
        <AnimatePresence>
          {!isOpened && (
            <motion.div exit={{ opacity: 0 }} transition={{ duration: 0.8 }} className="fixed inset-0 z-50 flex justify-center items-center w-full h-full pointer-events-none">
              <div className="max-w-md w-full h-full relative overflow-hidden pointer-events-auto cursor-pointer shadow-2xl bg-[#9B1B1B]" onClick={handleOpenCard}>
                <motion.div initial={{ x: 0 }} exit={{ x: "-100%" }} transition={{ duration: 1.5 }} className="absolute inset-y-0 left-0 w-1/2 bg-[#9B1B1B] border-r border-red-800/50" />
                <motion.div initial={{ x: 0 }} exit={{ x: "100%" }} transition={{ duration: 1.5 }} className="absolute inset-y-0 right-0 w-1/2 bg-[#9B1B1B] border-l border-red-500/30" />
                <motion.div exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.5 }} className="absolute inset-0 flex flex-col justify-center items-center text-center text-[#E5C158] px-6 z-10 pointer-events-none">
                   <h2 className="text-xs tracking-[0.4em] uppercase opacity-90 font-semibold mb-10">Thiệp Mời Cưới</h2>
                   <div className="space-y-4 mb-10" style={{ fontFamily: "'Dancing Script', cursive" }}>
                     <div className="text-4xl">{name1}</div><div className="text-2xl text-[#E5C158]/80">&</div><div className="text-4xl">{name2}</div>
                   </div>
                   <div className="text-[100px] font-bold mb-10 opacity-90">囍</div>
                   <div className="absolute bottom-12 text-sm font-serif italic opacity-70 animate-pulse">Chạm để mở thiệp</div>
                </motion.div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* VIỀN TRANG TRÍ */}
        <div className="absolute left-0 top-0 bottom-0 w-3 bg-[repeating-linear-gradient(0deg,#E5C158,#E5C158_10px,#FFF_10px,#FFF_20px)] border-r border-yellow-200 z-20 opacity-90 pointer-events-none" />
        <div className="absolute right-0 top-0 bottom-0 w-3 bg-[repeating-linear-gradient(0deg,#E5C158,#E5C158_10px,#FFF_10px,#FFF_20px)] border-l border-yellow-200 z-20 opacity-90 pointer-events-none" />

        {/* NỘI DUNG CHÍNH CỦA THIỆP */}
        <div className="pt-20 px-6 pb-20 relative z-10">
          
          {/* HEADER & ẢNH BÌA */}
          <motion.div initial={{ opacity: 0, y: 40 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 1.2, delay: 0.3 }} className="text-center mb-16 relative">
            <h2 className="text-xs tracking-[0.3em] text-gray-600 uppercase mb-3 font-semibold">THIỆP MỜI</h2>
            <h1 className="text-5xl text-gray-900 mb-4" style={{ fontFamily: "'Dancing Script', cursive" }}>{name1} <span className="text-3xl text-gray-400">&</span> {name2}</h1>
            <div className="text-4xl text-[#9B1B1B] font-bold my-3 select-none">囍</div>
            <p className="text-xs uppercase tracking-widest font-bold text-gray-700 mb-1">{data.wedding_time}</p>
            <p className="text-xl font-bold tracking-[0.15em] text-gray-900 mb-8">{data.wedding_date}</p>
            <div className="relative mx-auto max-w-[280px] p-2 bg-white border-2 border-[#9B1B1B] shadow-lg rounded-sm">
              <div className="aspect-[3/4] overflow-hidden bg-gray-100"><img src={coverPhoto} className="w-full h-full object-cover" /></div>
            </div>
          </motion.div>

          {/* LỜI CHÀO VIP & BỘ 3 ẢNH */}
          <motion.div initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "-50px" }} className="text-center mb-16">
            <div className="flex items-center justify-center gap-3 mb-6 text-[#E5C158]"><span className="w-12 h-[1px] bg-[#E5C158]"></span><span className="text-lg">❀</span><span className="w-12 h-[1px] bg-[#E5C158]"></span></div>
            
            {/* LOGIC ĐỊNH DANH VIP (FONT DANCING SCRIPT) */}
            {vipName ? (
              <div className="mb-10 p-5 bg-[#FDFBF7] border-y border-[#E5C158]/40 shadow-sm mx-2">
                 <p className="text-xs tracking-widest text-gray-500 uppercase font-semibold mb-2">Trân trọng kính mời</p>
                 <h2 className="text-4xl text-[#9B1B1B] leading-relaxed mt-2" style={{ fontFamily: "'Dancing Script', cursive" }}>{vipName}</h2>
              </div>
            ) : (
              <p className="text-gray-700 italic text-base mb-10" style={{ fontFamily: "'Dancing Script', cursive", fontSize: "24px" }}>Trân Trọng Kính Mời</p>
            )}

            <div className="grid grid-cols-3 gap-2 items-center mb-8 px-2">
              <div className="aspect-[3/4] rounded-md overflow-hidden shadow-md transform -rotate-2"><img src={trioPhotos[0] || coverPhoto} className="w-full h-full object-cover" /></div>
              <div className="aspect-[3/4] rounded-md overflow-hidden shadow-lg z-10 scale-105 border border-[#E5C158]"><img src={trioPhotos[1] || coverPhoto} className="w-full h-full object-cover" /></div>
              <div className="aspect-[3/4] rounded-md overflow-hidden shadow-md transform rotate-2"><img src={trioPhotos[2] || coverPhoto} className="w-full h-full object-cover" /></div>
            </div>
          </motion.div>

          {/* CHI TIẾT SỰ KIỆN (THỜI GIAN & ĐỊA ĐIỂM) */}
          <motion.div initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="text-center mb-16 px-4">
            <h3 className="text-2xl text-[#9B1B1B] mb-6 uppercase tracking-wider font-bold text-sm">
              {data.invitation_type === "NHA_GAI" ? "Lễ Vu Quy" : data.invitation_type === "NHA_TRAI" ? "Lễ Thành Hôn" : "Tiệc Báo Hỷ"}
            </h3>
            <div className="border-y border-[#E5C158] py-4 mb-6">
              <p className="text-3xl font-bold text-gray-800">{data.wedding_time}</p>
              <p className="text-gray-500 text-sm tracking-widest uppercase my-2">Ngày</p>
              <p className="text-2xl font-bold text-gray-800">{data.wedding_date}</p>
              {data.lunar_date && <p className="text-gray-500 text-sm italic mt-2">({data.lunar_date})</p>}
            </div>
            <p className="text-sm uppercase tracking-widest text-gray-500 mb-2 font-bold">Địa Điểm Tổ Chức</p>
            <p className="text-lg font-bold text-gray-800 mb-2">{data.location_name}</p>
            <p className="text-sm text-gray-600 mb-6 px-4">{data.wedding_address}</p>
            {data.map_link && (
              <a href={data.map_link} target="_blank" rel="noreferrer" className="inline-block border border-[#9B1B1B] text-[#9B1B1B] px-6 py-2 rounded uppercase text-xs tracking-widest font-bold hover:bg-[#9B1B1B] hover:text-white transition">Chỉ Đường Google Maps</a>
            )}
          </motion.div>

          {/* ĐẾM NGƯỢC THỜI GIAN */}
          {settings.show_countdown && (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} className="mb-16">
              <h3 className="text-center text-sm uppercase tracking-widest text-gray-500 mb-6 font-bold">Cùng đếm ngược</h3>
              <div className="flex justify-center gap-4">
                {[ { label: "Ngày", value: timeLeft.days }, { label: "Giờ", value: timeLeft.hours }, { label: "Phút", value: timeLeft.minutes }, { label: "Giây", value: timeLeft.seconds } ].map((item, idx) => (
                  <div key={idx} className="flex flex-col items-center">
                    <div className="w-14 h-14 bg-white border border-[#E5C158] rounded-full flex items-center justify-center shadow-md mb-2"><span className="text-xl font-bold text-[#9B1B1B]">{item.value}</span></div>
                    <span className="text-xs text-gray-500 uppercase tracking-wider">{item.label}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* 🔴 FORM RSVP - 3 TÙY CHỌN TÂM LÝ */}
          {settings.show_rsvp && (
            <motion.div initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="bg-[#9B1B1B] p-6 rounded-2xl shadow-xl text-white mb-10">
              <h3 className="text-4xl text-center mb-2 mt-2" style={{ fontFamily: "'Dancing Script', cursive" }}>Xác Nhận Tham Dự</h3>
              <p className="text-center text-xs text-white/70 mb-6 italic">Sự hiện diện của bạn là niềm vinh hạnh cho gia đình.</p>
              
              <form onSubmit={handleWishSubmit} className="space-y-4">
                {/* Khách tự nhập tên */}
                <input type="text" value={guestName} onChange={(e) => setGuestName(e.target.value)} placeholder="Nhập họ tên của bạn..." className="w-full bg-white/10 border border-white/20 p-3 rounded-lg text-white placeholder-gray-300 focus:outline-none text-sm" required />
                
                {/* 3 Tùy chọn */}
                <select value={attendance} onChange={(e) => setAttendance(e.target.value)} className="w-full bg-red-900 border border-white/20 p-3 rounded-lg text-white focus:outline-none text-sm">
                  <option value="Có tham dự">Chắc chắn tôi sẽ tham dự 🥰</option>
                  <option value="Cố gắng thu xếp">Sẽ cố gắng thu xếp 🤞</option>
                  <option value="Không tham dự">Rất tiếc vì vắng mặt 😢</option>
                </select>
                
                <textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Nhập lời chúc tốt đẹp nhất..." rows={3} className="w-full bg-white/10 border border-white/20 p-3 rounded-lg text-white placeholder-gray-300 focus:outline-none text-sm"></textarea>
                <button type="submit" disabled={submitting} className="w-full bg-[#E5C158] text-[#9B1B1B] font-bold py-3 rounded-lg hover:bg-yellow-400 transition uppercase text-sm tracking-wider">
                  {submitting ? "Đang gửi..." : "Gửi Lời Chúc"}
                </button>
                {wishStatus && <p className="text-center text-xs text-yellow-300 font-semibold mt-2">{wishStatus}</p>}
              </form>
            </motion.div>
          )}

          {/* GỬI MỪNG CƯỚI (MỞ MODAL) */}
          {settings.show_gift && (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} whileInView={{ opacity: 1, scale: 1 }} viewport={{ once: true }} className="text-center mb-16 mt-6">
              <button onClick={() => setShowGiftModal(true)} className="bg-white border-2 border-[#9B1B1B] text-[#9B1B1B] px-8 py-3 rounded-full font-bold inline-flex items-center gap-2 hover:bg-[#9B1B1B] hover:text-white transition shadow-md tracking-wider text-sm">
                🎁 Gửi Mừng Cưới
              </button>
            </motion.div>
          )}

          {/* 🔴 ALBUM ẢNH (CÓ NÚT THẢ TIM) */}
          {settings.show_album && albumPhotos.length > 0 && (
            <div className="text-center mb-16">
              <h3 className="text-4xl text-[#9B1B1B] mb-6" style={{ fontFamily: "'Dancing Script', cursive" }}>Album Cưới</h3>
              <div className="grid grid-cols-2 gap-3 mt-4">
                {albumPhotos.map((photo: string, index: number) => (
                  <motion.div key={index} initial={{ opacity: 0, y: 30 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} className="relative rounded-xl overflow-hidden shadow-md aspect-[3/4] group">
                    <img src={photo} className="w-full h-full object-cover" loading="lazy" />
                    
                    {/* Nút thả tim bay lơ lửng */}
                    <button 
                      onClick={() => toggleLike(index)}
                      className="absolute bottom-2 right-2 bg-white/80 backdrop-blur-sm w-8 h-8 rounded-full flex items-center justify-center shadow-lg transition transform active:scale-75"
                    >
                      <span className={`text-lg transition-colors ${likedPhotos[index] ? 'text-red-500 animate-pulse' : 'text-gray-400'}`}>
                        {likedPhotos[index] ? '❤️' : '🤍'}
                      </span>
                    </button>
                  </motion.div>
                ))}
              </div>
            </div>
          )}
          
          <div className="text-center pb-6">
             <p className="text-3xl text-gray-800" style={{ fontFamily: "'Dancing Script', cursive" }}>Thank You</p>
          </div>

        </div>
      </div>
      
      {/* MODAL MỪNG CƯỚI */}
      {showGiftModal && (
         <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4">
           <div className="bg-white p-6 rounded-xl relative max-w-sm w-full text-center">
             <button onClick={()=>setShowGiftModal(false)} className="absolute top-2 right-4 text-2xl text-gray-500 hover:text-red-500">&times;</button>
             <h3 className="text-lg font-bold text-[#9B1B1B] mb-2 uppercase tracking-wide">Hộp Tâm Giao</h3>
             <p className="text-xs text-gray-500 mb-4">Món quà nhỏ, tình cảm lớn</p>
             <div className="bg-gray-100 p-2 rounded-lg inline-block mb-4"><img src={data.bank_qr} className="w-48 h-48 object-contain" /></div>
             <div className="text-sm text-gray-700 space-y-1 mb-4"><p>Ngân hàng: <strong>{data.bank_name}</strong></p><p>Chủ TK: <strong>{data.bank_owner}</strong></p><p>Số TK: <strong>{data.bank_account}</strong></p></div>
             {data.bank_account && <button onClick={handleCopySTK} className="w-full bg-[#E5C158] py-3 rounded-xl font-bold text-[#9B1B1B] uppercase tracking-wider">{copied ? "✔️ Đã Copy Số Tài Khoản" : "Copy Số Tài Khoản"}</button>}
           </div>
         </div>
      )}
    </div>
  );
}

// Bọc Component trong Suspense theo chuẩn Next.js để đọc an toàn thanh địa chỉ URL (?n=...)
export default function InvitationPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#FDFBF7] flex items-center justify-center font-bold text-[#9B1B1B]">Đang tải...</div>}>
      <InvitationContent />
    </Suspense>
  );
}