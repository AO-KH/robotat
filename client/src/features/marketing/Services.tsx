import { motion } from "framer-motion";
import { Cpu, ShieldCheck, Wrench, BarChart3, ArrowRight } from "lucide-react";
import { useDemoModal } from "@/features/booking/DemoModalContext";

const services = [
  {
    title: "Cutting Grass",
    description: "Low-profile autonomous mowing for orchards, vineyards, and large estates. Maintains perfect turf height without manual labor.",
    icon: Wrench,
  },
  {
    title: "Spraying Fertilizer and Compost",
    description: "Precision application of liquid nutrients and compost tea. Reduces waste and ensures every plant gets exactly what it needs.",
    icon: BarChart3,
  },
  {
    title: "Cultivate Your Land",
    description: "Smart soil preparation and weeding. Our robots adapt to soil conditions to create the ideal environment for your crops.",
    icon: Cpu,
  },
  {
    title: "Schedule a Maintenance",
    description: "AI-driven diagnostics predict hardware needs before they fail, keeping your fleet operational.",
    icon: ShieldCheck,
  }
];

export default function Services() {
  const { openModal } = useDemoModal();

  return (
    <div className="min-h-screen pt-28 pb-24 md:pb-12">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-24">
        
        {/* Header */}
        <div className="text-center max-w-3xl mx-auto">
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="text-4xl md:text-5xl font-bold tracking-tight mb-6"
          >
            End-to-End <span className="text-primary">Autonomy Services</span>
          </motion.h1>
          <motion.p 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-lg text-muted-foreground"
          >
            From initial setup to ongoing optimization, NASL provides a comprehensive service wrapper around the ROBOTAT platform.
          </motion.p>
        </div>

        {/* Services Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          {services.map((service, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: index * 0.1 }}
              className="glass-card p-8 rounded-3xl group hover:-translate-y-1 transition-all duration-300 hover:border-primary/30 flex flex-col"
            >
              <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center text-primary mb-6 group-hover:scale-110 transition-transform">
                <service.icon className="w-7 h-7" />
              </div>
              <h3 className="text-2xl font-bold text-foreground mb-3">{service.title}</h3>
              <p className="text-muted-foreground leading-relaxed flex-1 mb-8">
                {service.description}
              </p>
              <button 
                onClick={openModal}
                className="w-full py-3 rounded-xl bg-white/5 border border-white/10 text-primary font-bold hover:bg-primary hover:text-white transition-all duration-300"
              >
                Request Service
              </button>
            </motion.div>
          ))}
        </div>

        {/* Partner Block */}
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          className="relative rounded-3xl overflow-hidden glass-card border-primary/20"
        >
          <div className="absolute inset-0 bg-gradient-to-r from-[#06040d] via-[#06040d]/90 to-transparent z-10" />
          {/* Services Page Partner image */}
          <img 
            src="https://lh3.googleusercontent.com/aida-public/AB6AXuB4onxYJAK0vyjFmBJULc2JDsnBEOjIxyaFsyYHLfC8N5PMFfmwtN36AHt-Qa5ljq0ypgtnEYa4pdMycIHLES-FtA0j5OXin2yee_JOi3W7-NSTEVo2UK2gD3HObg9p07hqvtRt-JoLHykx7GbehOGnTqlJm27o_d7VJCTampsWGJ04pv5OXF2mH2yX3T5FqumQmCPL-jTRYVGxUpBZfnbQGm-vkM4BUOmZYJOiJme35xBfmMA2WWr0mbJqIhFW1rRdx2hoNrAozg" 
            alt="xMachines Partnership"
            className="absolute inset-0 w-full h-full object-cover object-right"
          />
          <div className="relative z-20 p-8 md:p-16 max-w-2xl">
            <div className="px-3 py-1 rounded-md bg-white/10 border border-white/20 text-xs font-mono inline-block mb-6">
              STRATEGIC PARTNERSHIP
            </div>
            <h2 className="text-3xl font-bold mb-6">Powered by xMachines Intelligence</h2>
            <blockquote className="text-xl text-muted-foreground italic border-l-4 border-primary pl-6 mb-8">
              "Integrating our precision AI with the ROBOTAT fleet has created the most capable agricultural platform on the market today."
            </blockquote>
            <p className="font-semibold text-foreground">— Director of Robotics, xMachines</p>
          </div>
        </motion.div>

        {/* Closing CTA */}
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="bg-gradient-to-br from-primary/20 to-secondary/30 rounded-3xl p-12 text-center border border-primary/20 relative overflow-hidden"
        >
          <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full h-full bg-[radial-gradient(ellipse_at_top,rgba(168,85,247,0.3)_0%,transparent_70%)] pointer-events-none" />
          <h2 className="text-3xl md:text-4xl font-bold mb-4 relative z-10">Ready to transform your operations?</h2>
          <p className="text-muted-foreground mb-8 max-w-2xl mx-auto relative z-10">
            Our robotics experts are ready to evaluate your farm's needs and design a custom deployment strategy.
          </p>
          <button 
            onClick={openModal}
            className="relative z-10 inline-flex items-center gap-2 px-8 py-4 rounded-xl bg-foreground text-background font-bold text-lg hover:bg-white hover:scale-105 transition-all duration-300"
          >
            Contact Sales <ArrowRight className="w-5 h-5" />
          </button>
        </motion.div>

      </div>
    </div>
  );
}
