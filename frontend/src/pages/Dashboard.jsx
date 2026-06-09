import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { TrendingUp, AlertTriangle, Package, Clock, ArrowUpRight, CheckCircle, XCircle } from 'lucide-react';
import { formatBytes, formatDate } from '../utils/format';

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [maxGrowth, setMaxGrowth] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      const [statsRes, growthRes] = await Promise.all([
        axios.get('/api/dashboard/stats'),
        axios.get('/api/dashboard/max-growth')
      ]);
      setStats(statsRes.data);
      setMaxGrowth(growthRes.data);
    } catch (err) {
      console.error('Failed to fetch dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <div className="p-8 text-center">加载中...</div>;

  const statsCards = [
    { label: '总构建次数', value: stats?.total_snapshots || 0, icon: Package, color: 'blue' },
    { label: '超预算次数', value: stats?.failed_count || 0, icon: AlertTriangle, color: 'red' },
    { label: '违规项总数', value: stats?.violation_count || 0, icon: TrendingUp, color: 'orange' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-800">仪表盘</h1>
        <button onClick={fetchData} className="text-blue-600 hover:text-blue-800 text-sm">
          刷新数据
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {statsCards.map((card, index) => {
          const Icon = card.icon;
          const colorClasses = {
            blue: 'bg-blue-100 text-blue-600',
            red: 'bg-red-100 text-red-600',
            orange: 'bg-orange-100 text-orange-600'
          };
          return (
            <div key={index} className="bg-white rounded-xl shadow-sm p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-gray-500 text-sm">{card.label}</p>
                  <p className="text-3xl font-bold text-gray-800 mt-1">{card.value}</p>
                </div>
                <div className={`p-3 rounded-xl ${colorClasses[card.color]}`}>
                  <Icon className="w-6 h-6" />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">体积趋势</h2>
          {stats?.size_trend?.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={stats.size_trend}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} tickFormatter={(d) => formatDate(d)} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => formatBytes(v)} />
                <Tooltip 
                  formatter={(value) => [formatBytes(value), '体积']}
                  labelFormatter={(label) => formatDate(label)}
                />
                <Line type="monotone" dataKey="gzip_size" stroke="#3b82f6" strokeWidth={2} dot={false} name="Gzip" />
                <Line type="monotone" dataKey="size" stroke="#10b981" strokeWidth={2} dot={false} name="原始" />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-400">暂无数据</div>
          )}
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-4">最大增长 Chunk</h2>
          {maxGrowth?.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={maxGrowth} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis type="number" tick={{ fontSize: 12 }} tickFormatter={(v) => formatBytes(v)} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
                <Tooltip 
                  formatter={(value) => [formatBytes(value), '增长']}
                />
                <Bar dataKey="growth" fill="#ef4444" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-64 flex items-center justify-center text-gray-400">暂无数据</div>
          )}
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6">
        <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
          <Clock className="w-5 h-5 text-gray-500" />
          最近异常构建
        </h2>
        {stats?.recent_failed?.length > 0 ? (
          <div className="space-y-3">
            {stats.recent_failed.map((snapshot) => (
              <div key={snapshot.id} className="flex items-center justify-between p-4 bg-red-50 rounded-lg border border-red-100">
                <div className="flex items-center gap-4">
                  <XCircle className="w-5 h-5 text-red-500" />
                  <div>
                    <p className="font-medium text-gray-800">版本 {snapshot.version}</p>
                    <p className="text-sm text-gray-500">{formatDate(snapshot.build_time)}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-gray-500">总计: {formatBytes(snapshot.total_gzip_size)}</p>
                  <p className="text-xs text-red-500">发布门禁: 失败</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="h-32 flex items-center justify-center text-gray-400">
            <CheckCircle className="w-6 h-6 mr-2 text-green-500" />
            暂无异常构建
          </div>
        )}
      </div>
    </div>
  );
}
