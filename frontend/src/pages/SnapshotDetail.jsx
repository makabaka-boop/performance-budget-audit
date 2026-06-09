import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import { ArrowLeft, GitBranch, Tag, Clock, FileText, AlertTriangle, ChevronDown, ChevronRight, BarChart3 } from 'lucide-react';
import { formatBytes, formatDate } from '../utils/format';

export default function SnapshotDetail() {
  const { id } = useParams();
  const [snapshot, setSnapshot] = useState(null);
  const [projectSnapshots, setProjectSnapshots] = useState([]);
  const [compareWith, setCompareWith] = useState('');
  const [expandedChunks, setExpandedChunks] = useState({});
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    fetchSnapshot();
  }, [id]);

  const fetchSnapshot = async () => {
    const res = await axios.get(`/api/snapshots/${id}`);
    setSnapshot(res.data);
    setNotes(res.data.notes || '');
    
    const projRes = await axios.get(`/api/snapshots/project/${res.data.project_id}`);
    setProjectSnapshots(projRes.data.filter(s => s.id !== parseInt(id)));
  };

  const handleSaveNotes = async () => {
    await axios.put(`/api/snapshots/${id}/notes`, { notes });
    setEditingNotes(false);
    setSnapshot({ ...snapshot, notes });
  };

  const toggleChunk = (chunkId) => {
    setExpandedChunks({ ...expandedChunks, [chunkId]: !expandedChunks[chunkId] });
  };

  const buildDependencyTree = (chunks) => {
    const tree = {};
    chunks.forEach(chunk => {
      if (chunk.dependency_source) {
        const parts = chunk.dependency_source.split('/');
        let current = tree;
        parts.forEach((part, idx) => {
          if (!current[part]) current[part] = { _children: {}, _size: 0 };
          if (idx === parts.length - 1) {
            current[part]._size += chunk.gzip_size;
          }
          current = current[part]._children;
        });
      }
    });
    return tree;
  };

  const DependencyTree = ({ tree, level = 0 }) => {
    const entries = Object.entries(tree);
    if (entries.length === 0) return null;
    
    return (
      <div className="ml-4">
        {entries.map(([key, value]) => (
          <div key={key} className="py-1">
            <div className="flex items-center gap-2">
              <ChevronRight className="w-4 h-4 text-gray-400" />
              <span className="text-gray-700">{key}</span>
              {value._size > 0 && (
                <span className="text-sm text-gray-500">({formatBytes(value._size)})</span>
              )}
            </div>
            <DependencyTree tree={value._children} level={level + 1} />
          </div>
        ))}
      </div>
    );
  };

  if (!snapshot) return <div className="p-8 text-center">加载中...</div>;

  const depTree = buildDependencyTree(snapshot.chunks || []);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Link to={`/projects/${snapshot.project_id}`} className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
            <Tag className="w-6 h-6 text-blue-500" />
            版本 {snapshot.version}
          </h1>
          <div className="flex items-center gap-4 mt-1 text-gray-500">
            <span className="flex items-center gap-1">
              <GitBranch className="w-4 h-4" />
              {snapshot.branch}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-4 h-4" />
              {formatDate(snapshot.build_time)}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={compareWith}
            onChange={(e) => setCompareWith(e.target.value)}
            className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          >
            <option value="">选择对比版本</option>
            {projectSnapshots.map(s => (
              <option key={s.id} value={s.id}>{s.version}</option>
            ))}
          </select>
          {compareWith && (
            <Link
              to={`/compare/${id}/${compareWith}`}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
            >
              <BarChart3 className="w-4 h-4" />
              对比
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-sm p-4">
          <p className="text-gray-500 text-sm">原始体积</p>
          <p className="text-2xl font-bold text-gray-800">{formatBytes(snapshot.total_size)}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4">
          <p className="text-gray-500 text-sm">Gzip体积</p>
          <p className="text-2xl font-bold text-blue-600">{formatBytes(snapshot.total_gzip_size)}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4">
          <p className="text-gray-500 text-sm">Chunk数量</p>
          <p className="text-2xl font-bold text-gray-800">{snapshot.chunks?.length || 0}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-4">
          <p className="text-gray-500 text-sm">违规数量</p>
          <p className={`text-2xl font-bold ${snapshot.violations?.length > 0 ? 'text-red-600' : 'text-green-600'}`}>
            {snapshot.violations?.length || 0}
          </p>
        </div>
      </div>

      {snapshot.violations?.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-red-800 flex items-center gap-2 mb-4">
            <AlertTriangle className="w-5 h-5" />
            预算违规
          </h3>
          <div className="space-y-2">
            {snapshot.violations.map((v, idx) => (
              <div key={idx} className="flex items-center justify-between bg-red-100 rounded-lg p-3">
                <span className="text-red-800">{v.message}</span>
                <span className="text-sm text-red-600">
                  {formatBytes(v.actual_value)} / {formatBytes(v.threshold)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800">Chunks 列表</h3>
        </div>
        <div className="space-y-2">
          {snapshot.chunks?.map((chunk) => (
            <div key={chunk.id} className="border border-gray-200 rounded-lg overflow-hidden">
              <div
                className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
                onClick={() => toggleChunk(chunk.id)}
              >
                <div className="flex items-center gap-3">
                  {expandedChunks[chunk.id] ? (
                    <ChevronDown className="w-4 h-4 text-gray-400" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  )}
                  <FileText className="w-4 h-4 text-gray-400" />
                  <span className="font-medium text-gray-800">{chunk.name}</span>
                  {chunk.chunk_type && (
                    <span className="px-2 py-0.5 bg-gray-100 rounded text-xs text-gray-600">
                      {chunk.chunk_type}
                    </span>
                  )}
                </div>
                <div className="text-right">
                  <p className="font-medium">{formatBytes(chunk.size)}</p>
                  <p className="text-sm text-gray-500">gzip: {formatBytes(chunk.gzip_size)}</p>
                </div>
              </div>
              {expandedChunks[chunk.id] && (
                <div className="px-4 pb-4 pt-2 border-t border-gray-100 bg-gray-50">
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                      <span className="text-gray-500">依赖来源: </span>
                      <span>{chunk.dependency_source || 'N/A'}</span>
                    </div>
                    <div>
                      <span className="text-gray-500">类型: </span>
                      <span>{chunk.chunk_type || 'N/A'}</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {Object.keys(depTree).length > 0 && (
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h3 className="text-lg font-semibold text-gray-800 mb-4">依赖体积树</h3>
          <DependencyTree tree={depTree} />
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-800">变更备注</h3>
          <button
            onClick={() => setEditingNotes(!editingNotes)}
            className="text-blue-600 hover:text-blue-800 text-sm"
          >
            {editingNotes ? '取消' : '编辑'}
          </button>
        </div>
        {editingNotes ? (
          <div className="space-y-3">
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
              rows={4}
              placeholder="输入备注内容..."
            />
            <button
              onClick={handleSaveNotes}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              保存备注
            </button>
          </div>
        ) : (
          <p className="text-gray-600 whitespace-pre-wrap">{snapshot.notes || '暂无备注'}</p>
        )}
      </div>
    </div>
  );
}
