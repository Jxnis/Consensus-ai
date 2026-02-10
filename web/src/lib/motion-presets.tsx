"use client";

import { memo, forwardRef } from "react";
import { motion, type MotionProps } from "motion/react";

// Common easing curves
const SMOOTH_EASE = [0.6, -0.05, 0.01, 0.99] as const;
const SMOOTH_OUT = [0.22, 1, 0.36, 1] as const;

// Animation Presets for Landing Page
export const motionPresets = {
  // Hero section animations - strong entrance
  heroSlideUp: {
    initial: { opacity: 0, y: 30 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.8, ease: SMOOTH_EASE },
  },

  // Standard slide up
  slideUp: {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.4, ease: SMOOTH_OUT },
  },

  // Subtle slide up
  slideUpSubtle: {
    initial: { opacity: 0, y: 8 },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.3, ease: SMOOTH_OUT },
  },

  // Fade in only
  fadeIn: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    transition: { duration: 0.4, ease: SMOOTH_OUT },
  },

  // Scale up (for cards/buttons)
  scaleIn: {
    initial: { opacity: 0, scale: 0.95 },
    animate: { opacity: 1, scale: 1 },
    transition: { duration: 0.4, ease: SMOOTH_OUT },
  },

  // Slide from left
  slideFromLeft: {
    initial: { opacity: 0, x: -20 },
    animate: { opacity: 1, x: 0 },
    transition: { duration: 0.4, ease: SMOOTH_OUT },
  },

  // Slide from right
  slideFromRight: {
    initial: { opacity: 0, x: 20 },
    animate: { opacity: 1, x: 0 },
    transition: { duration: 0.4, ease: SMOOTH_OUT },
  },
} as const;

// Helper function to add delay to any preset
export const withDelay = (
  preset: (typeof motionPresets)[keyof typeof motionPresets],
  delay: number
) => ({
  ...preset,
  transition: { ...preset.transition, delay },
});

// Helper function to add stagger to children
export const withStagger = (
  preset: (typeof motionPresets)[keyof typeof motionPresets],
  staggerChildren: number = 0.1
) => ({
  ...preset,
  transition: {
    ...preset.transition,
    staggerChildren,
  },
});

// Reusable Motion Components
interface MotionDivProps
  extends Omit<MotionProps, "initial" | "animate" | "transition"> {
  preset?: keyof typeof motionPresets;
  delay?: number;
  className?: string;
  children: React.ReactNode;
}

export const MotionDiv = memo(
  forwardRef<HTMLDivElement, MotionDivProps>(function MotionDiv(
    { preset = "slideUp", delay = 0, className, children, ...props },
    ref
  ) {
    const animation =
      delay > 0
        ? withDelay(motionPresets[preset], delay)
        : motionPresets[preset];

    return (
      <motion.div
        ref={ref}
        className={className}
        initial={animation.initial}
        animate={animation.animate}
        transition={animation.transition}
        {...props}
      >
        {children}
      </motion.div>
    );
  })
);

// Specific preset components for Hero section
export const HeroSlideUp = memo(function HeroSlideUp({
  className,
  children,
  delay = 0,
}: {
  className?: string;
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <MotionDiv preset="heroSlideUp" delay={delay} className={className}>
      {children}
    </MotionDiv>
  );
});

// Standard components
export const SlideUp = memo(function SlideUp({
  className,
  children,
  delay = 0,
}: {
  className?: string;
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <MotionDiv preset="slideUp" delay={delay} className={className}>
      {children}
    </MotionDiv>
  );
});

export const SlideUpSubtle = memo(function SlideUpSubtle({
  className,
  children,
  delay = 0,
}: {
  className?: string;
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <MotionDiv preset="slideUpSubtle" delay={delay} className={className}>
      {children}
    </MotionDiv>
  );
});

export const FadeIn = memo(function FadeIn({
  className,
  children,
  delay = 0,
}: {
  className?: string;
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <MotionDiv preset="fadeIn" delay={delay} className={className}>
      {children}
    </MotionDiv>
  );
});

export const ScaleIn = memo(function ScaleIn({
  className,
  children,
  delay = 0,
}: {
  className?: string;
  children: React.ReactNode;
  delay?: number;
}) {
  return (
    <MotionDiv preset="scaleIn" delay={delay} className={className}>
      {children}
    </MotionDiv>
  );
});
