import React from 'react';

export default function Badge({ tone = 'teal', children, id }) {
  return (
    <span className={`badge b-${tone}`} id={id}>
      {children}
    </span>
  );
}
