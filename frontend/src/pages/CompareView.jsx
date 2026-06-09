import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, TrendingUp, TrendingDown } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { formatBytes } from '../utils/format';

export default function CompareView() {
  const { snapshotId, compareId } = useParams();
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetchCompare();
  }, [snapshotId, compareId]);

  const fetchCompare = async () => {
    const res = await axios.get(`/api/snapshots/${snapshotId}/compare/${compareId}`);
    setData(res.data);
  };

  if (!data) return <div className="p-8 text-center">加载中...</div>;

  const { snapshot1, snapshot2, changes, total_diff, total_gzip_diff } = data;

  const filteredChanges = changes.filter(c => {
    if (filter === 'all') return true;
    return c.status === filter;
  });

  const chartData = filteredChanges.slice(0, 15).map(c => ({
    name: c.name,
    diff: c.status === 'added' ? c.new_gzip_size : c.status === 'removed' ? -c.old_gzip_size : c.gzip_diff
  }));

  const StatusBadge = ({ status }) => {
    const configs = {
      added: { icon: TrendingUp, color: 'text-green-600 bg-green-100', text: '新增' },
      removed: { icon: TrendingDown, color: 'text-red-600 bg-red-100', text: '删除' },
      modified: { icon: TrendingUp, color: 'text-blue-600 bg-blue-100', text: '修改' }
    };
    const { icon: Icon, color, text } = configs[status] || configs.modified;
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${color}`}>
        <Icon className="w-3 h-3" />
        {text}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to={`/snapshots/${snapshotId}`} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-800">版本对比</h1>
          <p className="text-gray-500">
            {snapshot1.version} vs {snapshot2.version}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm p-4">
          <p className="text-gray-500 text-sm">总体积差异</p>
          <p className={`text-2xl font-bold ${total_diff >= 0 ? 'text-red-600' : 'text-green-600'}`}>
            {total_diff >= 0 ? '+' : ''}{formatBytes(total_diff)}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4">
          <p className="text-gray-500 text-sm">Gzip差异</p>
          <p className={`text-2xl font-bold ${total_gzip_diff >= 0 ? 'text-red-600' : 'text-green-600'}`}>
            {total_gzip_diff >= 0 ? '+' : ''}{formatBytes(total_gzip_diff)}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4">
          <p className="text-gray-500 text-sm">新增 Chunk</p>
          <p className="text-2xl font-bold text-green-600">
            {changes.filter(c => c.status === 'added').length}
          </p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4">
          <p className="text-gray-500 text-sm">删除 Chunk</p>
          <p className="text-2xl font-bold text-red-600">
            {changes.filter(c => c.status === 'removed').length}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6">
        <h3 className="text-lg font-semibold text-gray-800 mb-4">体积变化图 (Gzip)</h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={(v) => formatBytes(v)} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={150} />
            <Tooltip formatter={(value) => [formatBytes(value), '差异']} />
            <Bar dataKey="diff" radius={[0, 4, 4, 0]}>
              {chartData.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.diff >= 0 ? '#ef4444' : '#22c55e'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800">变更明细</h3>
          <div className="flex gap-2">
            {['all', 'added', 'removed', 'modified'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                  filter === f
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {f === 'all' ? '全部' : f === 'added' ? '新增' : f === 'removed' ? '删除' : '修改'}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">名称</th>
                <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">状态</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-500">原体积</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-500">新体积</th>
                <th className="text-right py-3 px-4 text-sm font-medium text-gray-500">Gzip差异</th>
              </tr>
            </thead>
            <tbody>
              {filteredChanges.map((change, idx) => (
                <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50">
                  <td className="py-3 px-4 font-medium">{change.name}</td>
                  <td className="py-3 px-4"><StatusBadge status={change.status} /></td>
                  <td className="py-3 px-4 text-right text-gray-600">
                    {change.old_gzip_size ? formatBytes(change.old_gzip_size) : '-'}
                  </td>
                  <td className="py-3 px-4 text-right text-gray-600">
                    {change.new_gzip_size ? formatBytes(change.new_gzip_size) : '-'}
                  </td>
                  <td className={`py-3 px-4 text-right font-medium ${
                    change.status === 'removed' ? 'text-green-600' : 
                    (change.gzip_diff || change.new_gzip_size || 0) > 0 ? 'text-red-600' : 'text-green-600'
                  }`}>
                    {change.status === 'added' ? `+${formatBytes(change.new_gzip_size)}` :
                     change.status === 'removed' ? `-${formatBytes(change.old_gzip_size)}` :
                     `${change.gzip_diff >= 0 ? '+' : ''}${formatBytes(change.gzip_diff)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
