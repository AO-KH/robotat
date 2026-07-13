import { motion, AnimatePresence } from "framer-motion";
import { Zap, Wifi, Target, MonitorPlay, X, ChevronRight, Shield, Battery, Gauge, Box } from "lucide-react";
import { useDemoModal } from "@/features/booking/DemoModalContext";
import { useSeo } from "@/lib/seo";
import { useState } from "react";

import maxT100Img from "@assets/max_t100_robot.png";
import grassCutterImg from "@assets/XMachines_GC02_1771963974422.JPG";
import cultivatorImg from "@assets/Gemini_Generated_Image_46wxzi46wxzi46wx_1771964517234.png";
import sprayerImg from "@assets/Untitled_Project_(8)_1771966958954.jpg";

const products = [
  {
    name: "MAX T100",
    role: "Heavy-Duty Autonomous Platform",
    desc: "The flagship autonomous robot platform. Engineered for 24/7 operations, it serves as the intelligent base for every NASL attachment — driving each row, mapping each acre, and carrying the tool the job needs.",
    img: maxT100Img,
    isPlatform: true,
    specs: [
      { label: "Power Source", value: "Exclusively Electric", icon: Zap },
      { label: "Construction", value: "High-Strength Steel Body", icon: Shield },
      { label: "Battery", value: "Hot-Swappable Packs", icon: Battery },
      { label: "Terrain", value: "Robust Multi-Terrain", icon: Gauge },
      { label: "Dimensions", value: "1.2m x 0.8m x 0.6m", icon: Box }
    ]
  },
  {
    name: "X-Grass Cutter",
    role: "Management Attachment",
    desc: "Low-profile cutting tool for orchards and vineyards. Snaps onto the MAX T100 for uniform, autonomous maintenance.",
    img: grassCutterImg,
    isPlatform: false,
    specs: [
      { label: "Cutting System", value: "Adjustable Electric Blade", icon: Target },
      { label: "Performance", value: "High-Powered Motors", icon: Zap },
      { label: "Durability", value: "Reinforced Steel Case", icon: Shield },
      { label: "Control", value: "Precision Height Adjustment", icon: Gauge },
      { label: "Dimensions", value: "0.9m x 0.7m x 0.4m", icon: Box }
    ]
  },
  {
    name: "X-Cultivator",
    role: "Soil Preparation Attachment",
    desc: "Precision soil implement that mounts to the MAX T100. Adapts to soil density in real time for a perfect seedbed.",
    img: cultivatorImg,
    isPlatform: false,
    specs: [
      { label: "Sensing", value: "Real-time Soil Analysis", icon: Wifi },
      { label: "Precision", value: "Sub-inch GPS Tracking", icon: Target },
      { label: "Operation", value: "Full Autonomous Weeding", icon: Zap },
      { label: "Versatility", value: "Modular Tool Head", icon: MonitorPlay },
      { label: "Dimensions", value: "1.1m x 0.9m x 0.5m", icon: Box }
    ]
  },
  {
    name: "X-Sprayer",
    role: "Targeted Application Attachment",
    desc: "Computer-vision guided sprayer for the MAX T100. Cuts chemical use by up to 60% through precise, plant-level application.",
    img: sprayerImg,
    isPlatform: false,
    specs: [
      { label: "Vision", value: "AI-Powered Plant Detection", icon: MonitorPlay },
      { label: "Efficiency", value: "60% Reduced Chemical Usage", icon: Gauge },
      { label: "Nozzles", value: "Individually Targeted Spray", icon: Target },
      { label: "Integration", value: "Live Telemetry Feed", icon: Wifi },
      { label: "Dimensions", value: "1.0m x 0.8m x 1.2m", icon: Box }
    ]
  }
];

export default function Fleet() {
  const { openModal } = useDemoModal();
  const [selectedProduct, setSelectedProduct] = useState<typeof products[0] | null>(null);
  useSeo({
    title: "Products — MAX T100 & Attachments",
    description:
      "Meet the MAX T100 autonomous platform and its ecosystem of attachments — X-Grass Cutter, X-Cultivator, and X-Sprayer. One base, every job in the field.",
  });

  return (
    <div className="min-h-screen pt-28 pb-24 md:pb-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-24">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto">
          <motion.h1
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-gradient text-4xl md:text-[52px] font-semibold tracking-[-0.02em] leading-[1.06] mb-4 inline-block"
          >
            Our products
          </motion.h1>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 }}
            className="text-xl md:text-[26px] text-muted-foreground font-medium leading-snug mb-4"
          >
            One platform. <span className="text-[#c084fc] italic">Unlimited attachments</span>
          </motion.p>
          <motion.p
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-[16px] md:text-[17px] text-muted-foreground leading-relaxed"
          >
            From agriculture to solar farms — meet the MAX T100 and its specialized ecosystem of
            attachments. One heavy-duty autonomous base, every job in the field.
          </motion.p>
        </div>

        {/* Fleet Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {products.map((product, i) => (
            <motion.div 
              key={product.name}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: i * 0.1 }}
              className="glass-card rounded-3xl overflow-hidden border-white/10 hover:border-primary/50 transition-colors duration-500 group flex flex-col cursor-pointer"
              onClick={() => setSelectedProduct(product)}
            >
              <div className={`h-64 relative overflow-hidden ${product.isPlatform ? "bg-[radial-gradient(ellipse_80%_70%_at_50%_40%,rgba(124,58,237,0.22),transparent_70%)]" : "bg-black/50"}`}>
                <div className="absolute inset-0 bg-gradient-to-t from-[#15101f] to-transparent z-10" />
                {product.isPlatform && (
                  <div className="absolute top-4 left-4 z-20 px-3 py-1 rounded-full bg-primary text-white text-[10px] font-bold tracking-widest uppercase shadow-[0_0_15px_rgba(168,85,247,0.6)]">
                    Base Platform
                  </div>
                )}
                {!product.isPlatform && (
                  <div className="absolute top-4 left-4 z-20 px-3 py-1 rounded-full bg-white/10 text-white/70 text-[10px] font-bold tracking-widest uppercase border border-white/20">
                    Attachment Tool
                  </div>
                )}
                <img
                  src={product.img}
                  alt={product.name}
                  className={`w-full h-full ${product.isPlatform ? "object-contain p-4" : "object-cover"} group-hover:scale-110 transition-transform duration-700`}
                />
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/40 z-30">
                  <div className="px-6 py-2 bg-primary rounded-full text-white text-sm font-bold shadow-2xl flex items-center gap-2">
                    View Details <ChevronRight className="w-4 h-4" />
                  </div>
                </div>
              </div>
              <div className="p-8 relative z-20 flex-1 flex flex-col">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-2xl font-bold font-mono">{product.name}</h3>
                  <span className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center border border-white/10 group-hover:bg-primary/20 group-hover:text-primary transition-colors">
                    <Target className="w-5 h-5" />
                  </span>
                </div>
                <p className="text-sm font-semibold text-primary mb-4 uppercase tracking-wider">{product.role}</p>
                <p className="text-muted-foreground flex-1 line-clamp-2">{product.desc}</p>
                
                <div className="mt-8 pt-6 border-t border-white/5 flex items-center justify-end">
                  <div className="text-primary text-xs font-bold hover:underline flex items-center gap-1">
                    Details <ChevronRight className="w-3 h-3" />
                  </div>
                </div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Product Detail Modal */}
        <AnimatePresence>
          {selectedProduct && (
            <>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setSelectedProduct(null)}
                className="fixed inset-0 z-[110] bg-black/80 backdrop-blur-md"
              />
              <div className="fixed inset-0 z-[111] flex items-center justify-center p-4 pointer-events-none">
                <motion.div
                  initial={{ opacity: 0, scale: 0.9, y: 40 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.9, y: 40 }}
                  className="w-full max-w-4xl bg-[#15101f] border border-white/10 rounded-[2rem] shadow-2xl overflow-hidden pointer-events-auto max-h-[90vh] flex flex-col"
                >
                  <div className="relative h-72 md:h-96 shrink-0">
                    <img src={selectedProduct.img} alt={selectedProduct.name} className={`w-full h-full ${selectedProduct.isPlatform ? "object-contain p-6 bg-[radial-gradient(ellipse_80%_70%_at_50%_40%,rgba(124,58,237,0.22),transparent_70%)]" : "object-cover"}`} />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#15101f] via-transparent to-transparent" />
                    <button 
                      onClick={() => setSelectedProduct(null)}
                      className="absolute top-6 right-6 p-2 rounded-full bg-black/40 backdrop-blur-md text-white hover:bg-primary transition-colors border border-white/10"
                    >
                      <X className="w-6 h-6" />
                    </button>
                  </div>
                  
                  <div className="p-8 md:p-12 overflow-y-auto">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                      <div>
                        <h2 className="text-4xl font-bold font-mono mb-2">{selectedProduct.name}</h2>
                        <p className="text-primary font-bold tracking-widest uppercase text-sm">{selectedProduct.role}</p>
                      </div>
                      <button 
                        onClick={() => {
                          setSelectedProduct(null);
                          openModal();
                        }}
                        className="px-8 py-4 rounded-full bg-primary text-white font-medium hover:bg-[#a855f7] transition-colors"
                      >
                        Book a Demo
                      </button>
                    </div>

                    <p className="text-lg text-muted-foreground mb-12 leading-relaxed">
                      {selectedProduct.desc}
                    </p>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                      {selectedProduct.specs?.map((spec, i) => (
                        <div key={i} className="p-6 rounded-2xl bg-white/5 border border-white/10">
                          <spec.icon className="w-6 h-6 text-primary mb-4" />
                          <h4 className="text-xs font-mono text-muted-foreground uppercase tracking-widest mb-1">{spec.label}</h4>
                          <p className="font-bold text-foreground">{spec.value}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </motion.div>
              </div>
            </>
          )}
        </AnimatePresence>

        {/* Command Center */}
        <motion.div 
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="relative rounded-3xl overflow-hidden glass-card p-1"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-secondary/40 to-primary/20 mix-blend-overlay" />
          <div className="bg-[#06040d] rounded-[1.35rem] p-8 md:p-16 relative z-10 border border-white/5">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
              <div>
                <h2 className="text-3xl md:text-4xl font-bold mb-6">Command Center</h2>
                <p className="text-lg text-muted-foreground mb-8 leading-relaxed">
                  Control the entire fleet from your tablet or desktop. Set boundaries, assign tasks, monitor live camera feeds, and review coverage maps all from one beautiful, intuitive interface.
                </p>
                <button 
                  onClick={openModal}
                  className="px-6 py-3 rounded-full border border-[#a855f7]/[0.22] hover:border-[#c084fc] hover:text-[#c084fc] text-foreground font-medium transition-colors"
                >
                  Request Platform Demo
                </button>
              </div>
              <div className="relative h-64 md:h-80 rounded-2xl border border-white/10 bg-[#15101f] overflow-hidden shadow-2xl flex items-center justify-center">
                {/* Abstract UI representation */}
                <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:20px_20px] [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,#000_70%,transparent_100%)]" />
                <div className="relative z-10 glass-card p-6 rounded-xl w-3/4 shadow-2xl border-primary/30">
                  <div className="flex gap-2 mb-4">
                    <div className="w-3 h-3 rounded-full bg-red-500" />
                    <div className="w-3 h-3 rounded-full bg-yellow-500" />
                    <div className="w-3 h-3 rounded-full bg-[#5eead4] shadow-[0_0_8px_#5eead4]" />
                  </div>
                  <div className="space-y-3">
                    <div className="h-4 bg-white/10 rounded w-1/3" />
                    <div className="h-20 bg-primary/20 rounded border border-primary/30" />
                    <div className="h-4 bg-white/10 rounded w-full" />
                    <div className="h-4 bg-white/10 rounded w-4/5" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

      </div>
    </div>
  );
}
