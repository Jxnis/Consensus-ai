const CouncilLogo = ({ className = "w-8 h-8" }: { className?: string }) => (
  <div className={`${className} relative overflow-hidden group/logo flex items-center justify-center`}>
    <div 
      className="w-full h-full bg-foreground transition-colors duration-300"
      style={{
        maskImage: 'url(/synapse_logo_clean.svg)',
        WebkitMaskImage: 'url(/synapse_logo_clean.svg)',
        maskRepeat: 'no-repeat',
        WebkitMaskRepeat: 'no-repeat',
        maskSize: 'contain',
        WebkitMaskSize: 'contain',
        maskPosition: 'center',
        WebkitMaskPosition: 'center',
      }}
    />
  </div>
);

export default CouncilLogo;
