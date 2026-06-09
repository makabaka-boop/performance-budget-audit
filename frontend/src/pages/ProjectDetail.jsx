import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import { Upload, GitBranch, Tag, Clock, Settings, AlertTriangle, CheckCircle, XCircle, ArrowLeft, FileJson } from 'lucide-react';
import { formatBytes, formatDate } from '../utils/format';

export default function ProjectDetail() {
  const { id } = useParams();
  const [project, setProject] = useState(null);
  const [snapshots, setSnapshots] = useState([]);
  const [budget, setBudget] = useState(null);
  const [showUpload, setShowUpload] = useState(false);
  const [showBudget, setShowBudget] = useState(false);
  const [filterBranch, setFilterBranch] = useState('');
  const [filterVersion, setFilterVersion] = useState('');
  const fileInputRef = useRef(null);
  const [uploadData, setUploadData] = useState({
    branch: 'main',
    version: '',
    commit_hash: '',
    notes: '',
    jsonContent: '',
    build_time: ''
  });
  const [budgetForm, setBudgetForm] = useState({});

  useEffect(() => {
    fetchProject();
    fetchSnapshots();
    fetchBudget();
  }, [id, filterBranch, filterVersion]);

  const fetchProject = async () => {
    const res = await axios.get(`/api/projects/${id}`);
    setProject(res.data);
  };

  const fetchSnapshots = async () => {
    const params = new URLSearchParams();
    if (filterBranch) params.append('branch', filterBranch);
    if (filterVersion) params.append('version', filterVersion);
    const res = await axios.get(`/api/snapshots/project/${id}?${params.toString()}`);
    setSnapshots(res.data);
  };

  const fetchBudget = async () => {
    const res = await axios.get(`/api/projects/${id}/budget`);
    setBudget(res.data);
    setBudgetForm(res.data);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        try {
          const content = event.target.result;
          JSON.parse(content);
          setUploadData({ ...uploadData, jsonContent: content });
        } catch (err) {
          alert('请上传有效的 JSON 文件');
        }
      };
      reader.readAsText(file);
    }
  };

  const handleUpload = async (e) => {
    e.preventDefault();
    try {
      if (!uploadData.jsonContent.trim()) {
        alert('请输入或上传构建清单 JSON');
        return;
      }

      let chunks = [];
      const parsed = JSON.parse(uploadData.jsonContent);
      chunks = Array.isArray(parsed) ? parsed : (parsed.chunks || parsed.assets || []);
      chunks = chunks.map(c => ({
        name: c.name || c.fileName || c.chunkNames?.[0] || 'unknown',
        size: c.size || 0,
        gzip_size: c.gzipSize || c.gzip_size || Math.round(c.size * 0.3),
        chunk_type: c.type || c.chunkType || 'asset',
        dependency_source: c.dependencySource || c.dependency_source || ''
      }));

      const payload = {
        project_id: id,
        branch: uploadData.branch,
        version: uploadData.version,
        commit_hash: uploadData.commit_hash,
        notes: uploadData.notes,
        chunks
      };

      if (uploadData.build_time) {
        payload.build_time = uploadData.build_time;
      }

      await axios.post('/api/snapshots', payload);

      setShowUpload(false);
      setUploadData({ branch: 'main', version: '', commit_hash: '', notes: '', jsonContent: '', build_time: '' });
      if (fileInputRef.current) fileInputRef.current.value = '';
      fetchSnapshots();
    } catch (err) {
      alert('上传失败: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleUpdateBudget = async (e) => {
    e.preventDefault();
    try {
      await axios.put(`/api/projects/${id}/budget`, budgetForm);
      setShowBudget(false);
      fetchBudget();
    } catch (err) {
      alert('更新失败');
    }
  };

  if (!project) return <div className="p-8 text-center">加载中...</div>;

  const GateStatusBadge = ({ status }) => {
    const configs = {
      passed: { icon: CheckCircle, color: 'text-green-500 bg-green-100', text: '通过' },
      failed: { icon: XCircle, color: 'text-red-500 bg-red-100', text: '失败' },
      pending: { icon: Clock, color: 'text-gray-500 bg-gray-100', text: '待定' }
    };
    const { icon: Icon, color, text } = configs[status] || configs.pending;
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
        <Link to="/projects" className="p-2 hover:bg-gray-100 rounded-lg">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-gray-800">{project.name}</h1>
          <p className="text-gray-500">{project.description}</p>
        </div>
        <button
          onClick={() => setShowBudget(true)}
          className="flex items-center gap-2 px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          <Settings className="w-4 h-4" />
          预算配置
        </button>
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Upload className="w-4 h-4" />
          上传构建
        </button>
      </div>

      {budget && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-xl shadow-sm p-4">
            <p className="text-gray-500 text-sm">最大总体积</p>
            <p className="text-xl font-bold text-gray-800">{formatBytes(budget.max_total_size)}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4">
            <p className="text-gray-500 text-sm">最大Chunk体积</p>
            <p className="text-xl font-bold text-gray-800">{formatBytes(budget.max_chunk_size)}</p>
          </div>
          <div className="bg-white rounded-xl shadow-sm p-4">
            <p className="text-gray-500 text-sm">最大Gzip体积</p>
            <p className="text-xl font-bold text-gray-800">{formatBytes(budget.max_gzip_size)}</p>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl shadow-sm p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-800">构建历史</h2>
          <div className="flex gap-3">
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-500">分支:</label>
              <input
                type="text"
                value={filterBranch}
                onChange={(e) => setFilterBranch(e.target.value)}
                placeholder="筛选分支"
                className="px-3 py-1 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-500">版本:</label>
              <input
                type="text"
                value={filterVersion}
                onChange={(e) => setFilterVersion(e.target.value)}
                placeholder="筛选版本"
                className="px-3 py-1 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
            </div>
            {(filterBranch || filterVersion) && (
              <button
                onClick={() => { setFilterBranch(''); setFilterVersion(''); }}
                className="px-3 py-1 text-sm text-gray-500 hover:text-gray-700"
              >
                清除筛选
              </button>
            )}
          </div>
        </div>
        {snapshots.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200">
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">版本</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">分支</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">构建时间</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">Gzip体积</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">门禁状态</th>
                  <th className="text-left py-3 px-4 text-sm font-medium text-gray-500">操作</th>
                </tr>
              </thead>
              <tbody>
                {snapshots.map((snapshot) => (
                  <tr key={snapshot.id} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <Tag className="w-4 h-4 text-gray-400" />
                        <span className="font-medium">{snapshot.version}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <GitBranch className="w-4 h-4 text-gray-400" />
                        <span>{snapshot.branch}</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-gray-600">{formatDate(snapshot.build_time)}</td>
                    <td className="py-3 px-4 font-medium">{formatBytes(snapshot.total_gzip_size)}</td>
                    <td className="py-3 px-4">
                      <GateStatusBadge status={snapshot.gate_status} />
                    </td>
                    <td className="py-3 px-4">
                      <Link to={`/snapshots/${snapshot.id}`} className="text-blue-600 hover:text-blue-800 text-sm">
                        查看详情
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12 text-gray-400">
            <AlertTriangle className="w-12 h-12 mx-auto mb-4" />
            <p>暂无构建快照，请上传第一个构建产物</p>
          </div>
        )}
      </div>

      {showUpload && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-2xl p-6 max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-800 mb-6">上传构建产物</h2>
            <form onSubmit={handleUpload} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">版本号</label>
                  <input
                    type="text"
                    value={uploadData.version}
                    onChange={(e) => setUploadData({ ...uploadData, version: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    placeholder="v1.0.0"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">分支</label>
                  <input
                    type="text"
                    value={uploadData.branch}
                    onChange={(e) => setUploadData({ ...uploadData, branch: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    placeholder="main"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Commit Hash</label>
                  <input
                    type="text"
                    value={uploadData.commit_hash}
                    onChange={(e) => setUploadData({ ...uploadData, commit_hash: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    placeholder="可选"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">构建时间</label>
                  <input
                    type="datetime-local"
                    value={uploadData.build_time}
                    onChange={(e) => setUploadData({ ...uploadData, build_time: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">备注</label>
                <textarea
                  value={uploadData.notes}
                  onChange={(e) => setUploadData({ ...uploadData, notes: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none resize-none"
                  placeholder="可选"
                  rows={2}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">构建清单 JSON</label>
                <div className="mb-3">
                  <label className="flex items-center justify-center gap-2 px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer hover:border-blue-400 hover:bg-blue-50 transition-colors">
                    <FileJson className="w-5 h-5 text-gray-400" />
                    <span className="text-sm text-gray-600">点击上传 JSON 文件</span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".json"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>
                <textarea
                  value={uploadData.jsonContent}
                  onChange={(e) => setUploadData({ ...uploadData, jsonContent: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none font-mono text-sm"
                  placeholder='[{"name": "main.js", "size": 102400, "gzipSize": 30000}]'
                  rows={8}
                />
                <p className="text-xs text-gray-500 mt-1">
                  支持 webpack stats、rollup stats 或自定义数组格式，包含 name/size/gzipSize 字段
                </p>
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowUpload(false)}
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  上传
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {showBudget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-md p-6">
            <h2 className="text-xl font-bold text-gray-800 mb-6">预算配置</h2>
            <form onSubmit={handleUpdateBudget} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">最大总体积 (字节)</label>
                <input
                  type="number"
                  value={budgetForm.max_total_size || ''}
                  onChange={(e) => setBudgetForm({ ...budgetForm, max_total_size: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">最大单Chunk体积 (字节)</label>
                <input
                  type="number"
                  value={budgetForm.max_chunk_size || ''}
                  onChange={(e) => setBudgetForm({ ...budgetForm, max_chunk_size: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">最大Gzip总体积 (字节)</label>
                <input
                  type="number"
                  value={budgetForm.max_gzip_size || ''}
                  onChange={(e) => setBudgetForm({ ...budgetForm, max_gzip_size: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                />
              </div>
              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowBudget(false)}
                  className="flex-1 px-4 py-3 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  保存
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
