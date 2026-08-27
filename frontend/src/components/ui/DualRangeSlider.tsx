"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";

interface DualRangeSliderProps {
  min: number;
  max: number;
  onChange: (minVal: number, maxVal: number) => void;
  formatValue?: (val: number) => string;
}

export default function DualRangeSlider({ min, max, onChange, formatValue }: DualRangeSliderProps) {
  const [minVal, setMinVal] = useState(min);
  const [maxVal, setMaxVal] = useState(max);
  const minValRef = useRef(min);
  const maxValRef = useRef(max);
  const range = useRef<HTMLDivElement>(null);

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

  const handleMinChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = Math.min(Number(event.target.value), maxVal - 1);
    setMinVal(value);
    minValRef.current = value;
  };

  const handleMaxChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = Math.max(Number(event.target.value), minVal + 1);
    setMaxVal(value);
    maxValRef.current = value;
  };

  const handleMouseUp = () => {
    onChange(minVal, maxVal);
  };

  const formattedMin = formatValue ? formatValue(minVal) : minVal;
  const formattedMax = formatValue ? formatValue(maxVal) : maxVal;

  return (
    <div className="w-full flex flex-col items-center">
      <div className="relative w-full h-10 flex items-center mb-1">
        <input
          type="range"
          min={min}
          max={max}
          value={minVal}
          onChange={handleMinChange}
          onMouseUp={handleMouseUp}
          onTouchEnd={handleMouseUp}
          className="thumb thumb-left"
          style={{ zIndex: minVal > max - 100 ? 5 : 3 }}
        />
        <input
          type="range"
          min={min}
          max={max}
          value={maxVal}
          onChange={handleMaxChange}
          onMouseUp={handleMouseUp}
          onTouchEnd={handleMouseUp}
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
      <div className="flex items-center justify-between w-full mt-4 gap-4 text-sm">
        <div className="flex flex-col w-full">
          <span className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1">Min</span>
          <div className="bg-gray-50 border border-gray-200 rounded-md px-3 py-2 text-gray-800 font-semibold truncate shadow-sm">
            {formattedMin}
          </div>
        </div>
        <div className="flex flex-col w-full">
          <span className="text-[10px] uppercase tracking-wider text-gray-500 font-bold mb-1 text-right">Max</span>
          <div className="bg-gray-50 border border-gray-200 rounded-md px-3 py-2 text-gray-800 font-semibold text-right truncate shadow-sm">
            {formattedMax}
          </div>
        </div>
      </div>
    </div>
  );
}
