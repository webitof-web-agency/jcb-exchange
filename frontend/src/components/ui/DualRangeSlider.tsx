"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";

interface DualRangeSliderProps {
  min: number;
  max: number;
  onChange: (minVal: number, maxVal: number) => void;
  formatValue?: (val: number) => string;
}

const getDefaultFormattedNumber = (val: number) =>
  new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(val);

export default function DualRangeSlider({ min, max, onChange, formatValue }: DualRangeSliderProps) {
  const [minVal, setMinVal] = useState(min);
  const [maxVal, setMaxVal] = useState(max);
  const minValRef = useRef(min);
  const maxValRef = useRef(max);
  const range = useRef<HTMLDivElement>(null);

  const [minInputText, setMinInputText] = useState(() => getDefaultFormattedNumber(min));
  const [maxInputText, setMaxInputText] = useState(() => getDefaultFormattedNumber(max));
  const [isMinFocused, setIsMinFocused] = useState(false);
  const [isMaxFocused, setIsMaxFocused] = useState(false);

  const formatInputNumber = useCallback(
    (val: number) => {
      const formattedValue = formatValue?.(val)?.replace(/[^\d.,]/g, '').trim();
      return formattedValue || getDefaultFormattedNumber(val);
    },
    [formatValue]
  );

  const getPercent = useCallback(
    (value: number) => {
      const rangeSize = max - min;
      return rangeSize > 0 ? Math.round(((value - min) / rangeSize) * 100) : 0;
    },
    [max, min]
  );

  useEffect(() => {
    const minPercent = getPercent(minVal);
    const maxPercent = getPercent(maxValRef.current);

    if (range.current) {
      range.current.style.left = `${minPercent}%`;
      range.current.style.width = `${maxPercent - minPercent}%`;
    }
  }, [minVal, getPercent]);

  useEffect(() => {
    const minPercent = getPercent(minValRef.current);
    const maxPercent = getPercent(maxVal);

    if (range.current) {
      range.current.style.width = `${maxPercent - minPercent}%`;
    }
  }, [maxVal, getPercent]);

  const handleMinSliderChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = Math.min(Number(event.target.value), maxVal - 1);
    setMinVal(value);
    minValRef.current = value;
    if (!isMinFocused) {
      setMinInputText(formatInputNumber(value));
    }
  };

  const handleMaxSliderChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = Math.max(Number(event.target.value), minVal + 1);
    setMaxVal(value);
    maxValRef.current = value;
    if (!isMaxFocused) {
      setMaxInputText(formatInputNumber(value));
    }
  };

  const handleSliderMouseUp = () => {
    onChange(minVal, maxVal);
  };

  const parsePriceInput = useCallback(
    (inputStr: string): number | null => {
      const cleaned = inputStr.replace(/[^0-9.lakhLakhLAClac]/g, "").trim().toLowerCase();
      if (!cleaned) return null;

      const isLakh = /lakh|lac|l/.test(cleaned);
      const numMatch = cleaned.match(/[\d.]+/);
      if (!numMatch) return null;

      const num = parseFloat(numMatch[0]);
      if (isNaN(num)) return null;

      if (isLakh) {
        return Math.round(num * 100000);
      }

      return Math.round(num);
    },
    []
  );

  const commitMinInput = () => {
    setIsMinFocused(false);
    const parsed = parsePriceInput(minInputText);
    if (parsed === null) {
      setMinInputText(formatInputNumber(minVal));
      return;
    }

    const clamped = Math.max(min, Math.min(parsed, maxVal - 1));
    setMinVal(clamped);
    minValRef.current = clamped;
    setMinInputText(formatInputNumber(clamped));
    onChange(clamped, maxVal);
  };

  const commitMaxInput = () => {
    setIsMaxFocused(false);
    const parsed = parsePriceInput(maxInputText);
    if (parsed === null) {
      setMaxInputText(formatInputNumber(maxVal));
      return;
    }

    const clamped = Math.min(max, Math.max(parsed, minVal + 1));
    setMaxVal(clamped);
    maxValRef.current = clamped;
    setMaxInputText(formatInputNumber(clamped));
    onChange(minVal, clamped);
  };

  return (
    <div className="w-full flex flex-col items-center">
      <div className="relative w-full h-10 flex items-center mb-2">
        <input
          type="range"
          min={min}
          max={max}
          value={minVal}
          onChange={handleMinSliderChange}
          onMouseUp={handleSliderMouseUp}
          onTouchEnd={handleSliderMouseUp}
          className="thumb thumb-left"
          style={{ zIndex: minVal > max - 100 ? 5 : 3 }}
        />
        <input
          type="range"
          min={min}
          max={max}
          value={maxVal}
          onChange={handleMaxSliderChange}
          onMouseUp={handleSliderMouseUp}
          onTouchEnd={handleSliderMouseUp}
          className="thumb thumb-right"
        />
        <div className="relative w-full">
          <div className="absolute w-full h-1.5 bg-gray-200 rounded-full z-1"></div>
          <div
            ref={range}
            className="absolute h-1.5 bg-jcb-yellow rounded-full z-2"
          ></div>
        </div>
      </div>

      <div className="flex items-center justify-between w-full mt-4 gap-2 text-sm">
        <div className="flex flex-col w-[45%]">
          <label htmlFor="min-price-input" className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1">
            Min
          </label>
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 font-semibold text-sm">₹</span>
            <input
              id="min-price-input"
              type="text"
              value={minInputText}
              onFocus={() => {
                setIsMinFocused(true);
                setMinInputText(String(minVal));
              }}
              onChange={(e) => setMinInputText(e.target.value)}
              onBlur={commitMinInput}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  commitMinInput();
                  (e.target as HTMLInputElement).blur();
                }
              }}
              className="w-full bg-white border border-gray-300 rounded-md pl-6 pr-2.5 py-1.5 text-gray-900 font-semibold text-xs sm:text-sm shadow-xs outline-none transition focus:border-jcb-yellow focus:ring-1 focus:ring-jcb-yellow truncate"
              placeholder="0"
            />
          </div>
        </div>

        <div className="text-gray-400 font-bold mt-4">-</div>

        <div className="flex flex-col w-[45%]">
          <label htmlFor="max-price-input" className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1 text-right">
            Max
          </label>
          <div className="relative">
            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-500 font-semibold text-sm">₹</span>
            <input
              id="max-price-input"
              type="text"
              value={maxInputText}
              onFocus={() => {
                setIsMaxFocused(true);
                setMaxInputText(String(maxVal));
              }}
              onChange={(e) => setMaxInputText(e.target.value)}
              onBlur={commitMaxInput}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  commitMaxInput();
                  (e.target as HTMLInputElement).blur();
                }
              }}
              className="w-full bg-white border border-gray-300 rounded-md pl-6 pr-2.5 py-1.5 text-gray-900 font-semibold text-xs sm:text-sm text-left shadow-xs outline-none transition focus:border-jcb-yellow focus:ring-1 focus:ring-jcb-yellow truncate"
              placeholder="1,00,00,000"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
