import React from 'react';
import Badge from './Badge';
import { formatTitleWord } from '../format';

const TONE_MAP = {
  FREE: 'teal',
  Free: 'teal',
  OCCUPIED: 'navy',
  Occupied: 'navy',
  RESERVED: 'amber',
  Reserved: 'amber',
  MAINTENANCE: 'red',
  Maintenance: 'red',
  Paid: 'teal',
  Pending: 'amber',
  Failed: 'red',
  Parked: 'navy',
  Active: 'teal',
  Disabled: 'red',
  'Monthly pass': 'teal',
  'Pay per hour': 'navy',
  Visitor: 'amber'
};

export default function StatusBadge({ status, tone, id }) {
  const resolvedTone = tone || TONE_MAP[status] || 'teal';
  const label =
    status === status?.toUpperCase() && status?.length > 3
      ? formatTitleWord(status)
      : status;
  return (
    <Badge tone={resolvedTone} id={id}>
      {label}
    </Badge>
  );
}
