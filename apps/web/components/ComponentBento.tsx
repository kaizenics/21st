import React from 'react';
import { ComponentCard } from './ComponentCard';
import { Component } from '../types/types';

interface ComponentBentoProps {
  components: Component[];
}

export function ComponentBento({ components }: ComponentBentoProps) {
  const gridItems = components.map((component) => (
    <div key={component.id} className={getSizeClass(component.size)}>
      <ComponentCard component={component} />
    </div>
  ));

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {gridItems}
    </div>
  );
}

function getSizeClass(size: string): string {
  switch (size) {
    case '1x1': return 'w-full h-full';
    case '1x2': return 'w-full h-full row-span-2';
    case '2x1': return 'w-full h-full col-span-2';
    case '2x2': return 'w-full h-full col-span-2 row-span-2';
    default: return 'w-full h-full';
  }
}