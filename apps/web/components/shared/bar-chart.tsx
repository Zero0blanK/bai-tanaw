'use client';

import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Card, CardHeader } from '@/components/ui/card';
import { Empty } from '@/components/ui/feedback';

export interface BarDatum {
  label: string;
  value: number;
  /** Mark color; defaults to the single-series brand color. Text never uses it. */
  color?: string;
}

const BRAND = '#000000';
const BAR_PX = 14;

/**
 * Horizontal single-series bar chart (dataviz rules: one baseline, <=24px bars, rounded-none data-end,
 * value at the tip in text ink, recessive grid, hover tooltip, and a table view so nothing is color-only).
 */
export function HBarChart({ title, description, data, emptyText = 'Nothing to show yet' }: { title: string; description?: string; data: BarDatum[]; emptyText?: string }) {
  const total = data.reduce((a, d) => a + d.value, 0);
  const height = Math.max(96, data.length * (BAR_PX + 10) + 26);

  return (
    <Card>
      <CardHeader title={title} {...(description ? { description } : {})} />
      {total === 0 ? (
        <Empty title={emptyText} />
      ) : (
        <div className="px-2 pb-1 pt-1">
          <div style={{ height }} role="img" aria-label={`${title}: ${data.map((d) => `${d.label} ${d.value}`).join(', ')}`}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} layout="vertical" margin={{ top: 4, right: 36, bottom: 4, left: 8 }} barCategoryGap={2}>
                <CartesianGrid horizontal={false} stroke="#e0e0dc" />
                <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: '#63635f' }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="label" width={112} tick={{ fontSize: 12, fill: '#000000', fontWeight: 600 }} axisLine={{ stroke: '#000000' }} tickLine={false} />
                <Tooltip
                  cursor={{ fill: '#efefec' }}
                  formatter={(value) => [String(value), 'Count']}
                  contentStyle={{ fontSize: 12, borderRadius: 0, borderColor: '#000000' }}
                />
                <Bar dataKey="value" barSize={BAR_PX} radius={0} isAnimationActive={false}>
                  {data.map((d) => (
                    <Cell key={d.label} fill={d.color ?? BRAND} />
                  ))}
                  <LabelList dataKey="value" position="right" style={{ fontSize: 12, fill: '#000000', fontWeight: 700 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          <details className="px-2 pb-2 text-xs text-ink-600">
            <summary className="cursor-pointer select-none">Show as table</summary>
            <table className="mt-2 w-full">
              <tbody>
                {data.map((d) => (
                  <tr key={d.label} className="border-t border-ink-100">
                    <td className="py-1">{d.label}</td>
                    <td className="py-1 text-right font-medium">{d.value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </div>
      )}
    </Card>
  );
}
