// src/pages/ResearchDetail.jsx - Public research report detail
import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
  ChevronLeft, Calendar, Eye, Heart, MessageCircle, Users, FileText,
  Download, Copy, Check, RefreshCw, Send, Reply, Trash2, BookOpen
} from 'lucide-react';
import { usePublicAuth } from '../contexts/PublicAuthContext';
import researchService from '../services/researchService';
import './ResearchDetail.css';

function ResearchDetail() {
  const { slug } = useParams();
  const { user, isAuthenticated } = usePublicAuth();
  const [report, setReport] = useState(null);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [commentText, setCommentText] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [citationText, setCitationText] = useState('');
  const [citationCopied, setCitationCopied] = useState(false);

  useEffect(() => {
    const fetchReport = async () => {
      setLoading(true);
      try {
        const data = await researchService.getBySlug(slug);
        setReport(data);
        setLiked(data.user_has_liked);
        setLikeCount(data.like_count);
        const cmts = await researchService.getComments(data.id);
        setComments(cmts);
        const cit = await researchService.getCitation(slug, 'apa');
        setCitationText(cit.citation);
      } catch (err) {
        setError(err.message || 'Report not found');
      } finally {
        setLoading(false);
      }
    };
    fetchReport();
  }, [slug]);

  const handleLike = async () => {
    if (!isAuthenticated || !report) return;
    try {
      if (liked) {
        const res = await researchService.unlike(report.id);
        setLikeCount(res.like_count);
        setLiked(false);
      } else {
        const res = await researchService.like(report.id);
        setLikeCount(res.like_count);
        setLiked(true);
      }
    } catch (err) { console.error('Like failed:', err); }
  };

  const handleComment = async (e) => {
    e.preventDefault();
    if (!commentText.trim() || !report) return;
    setSubmitting(true);
    try {
      await researchService.addComment(report.id, commentText.trim(), replyTo);
      const cmts = await researchService.getComments(report.id);
      setComments(cmts);
      setCommentText('');
      setReplyTo(null);
    } catch (err) { console.error('Comment failed:', err); }
    finally { setSubmitting(false); }
  };

  const handleDeleteComment = async (commentId) => {
    try {
      await researchService.deleteComment(commentId);
      const cmts = await researchService.getComments(report.id);
      setComments(cmts);
    } catch (err) { console.error('Delete failed:', err); }
  };

  const handleCopyCitation = () => {
    navigator.clipboard.writeText(citationText);
    setCitationCopied(true);
    setTimeout(() => setCitationCopied(false), 2000);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  const renderSectionContent = (section) => {
    switch (section.section_type) {
      case 'text':
        return <div className="section-text" dangerouslySetInnerHTML={{ __html: section.content?.html || '' }} />;
      case 'chart':
        return (
          <div className="section-chart-placeholder">
            <BookOpen size={32} />
            <p>Interactive chart: {section.content?.chart_type || 'data visualisation'}</p>
          </div>
        );
      case 'table':
        return (
          <div className="section-table-placeholder">
            <p>Data table: {section.title}</p>
          </div>
        );
      case 'image':
        return section.content?.url ? (
          <img src={section.content.url} alt={section.content.alt || section.title} className="section-image" />
        ) : null;
      default:
        return <p>{JSON.stringify(section.content)}</p>;
    }
  };

  const renderComment = (comment, depth = 0) => (
    <div key={comment.id} className={`comment ${depth > 0 ? 'comment-reply' : ''}`}>
      <div className="comment-header">
        <span className="comment-author">{comment.user_name || 'Anonymous'}</span>
        <span className="comment-date">{formatDate(comment.created_at)}</span>
      </div>
      <p className="comment-body">{comment.body}</p>
      <div className="comment-actions">
        {isAuthenticated && !comment.is_deleted && (
          <button className="comment-action-btn" onClick={() => { setReplyTo(comment.id); setCommentText(''); }}>
            <Reply size={14} /> Reply
          </button>
        )}
        {isAuthenticated && (comment.user_id === user?.id || user?.is_admin) && !comment.is_deleted && (
          <button className="comment-action-btn danger" onClick={() => handleDeleteComment(comment.id)}>
            <Trash2 size={14} /> Delete
          </button>
        )}
      </div>
      {comment.replies && comment.replies.length > 0 && (
        <div className="comment-replies">
          {comment.replies.map((r) => renderComment(r, depth + 1))}
        </div>
      )}
    </div>
  );

  if (loading) {
    return <div className="research-detail-loading"><RefreshCw className="spin" size={24} /><p>Loading report...</p></div>;
  }
  if (error || !report) {
    return <div className="research-detail-error"><p>{error || 'Report not found'}</p><Link to="/research">Back to research</Link></div>;
  }

  return (
    <div className="research-detail-page">
      {/* Hero */}
      <header className="research-detail-hero">
        <div className="research-detail-hero-content">
          <Link to="/research" className="research-back-link"><ChevronLeft size={16} /> All Research</Link>
          <h1>{report.title}</h1>
          <div className="research-detail-meta">
            {report.authors && report.authors.length > 0 && (
              <span><Users size={14} /> {report.authors.join(', ')}</span>
            )}
            <span><Calendar size={14} /> {formatDate(report.published_at)}</span>
            <span>v{report.version}</span>
            <span><Eye size={14} /> {report.view_count} views</span>
          </div>
        </div>
      </header>

      <div className="research-detail-content">
        {/* Abstract */}
        <div className="research-detail-abstract">
          <h2>Abstract</h2>
          <p>{report.abstract}</p>
        </div>

        {/* Sections */}
        {report.sections && report.sections.length > 0 && (
          <div className="research-detail-sections">
            {report.sections.map((section) => (
              <div key={section.id} className="research-section">
                <h3>{section.title}</h3>
                {renderSectionContent(section)}
                {section.caption && <p className="section-caption">{section.caption}</p>}
              </div>
            ))}
          </div>
        )}

        {/* Files */}
        {report.files && report.files.length > 0 && (
          <div className="research-detail-files">
            <h3>Downloads</h3>
            <div className="files-list">
              {report.files.map((file) => (
                <a key={file.id} href={file.file_url} className="file-item" target="_blank" rel="noopener noreferrer">
                  <FileText size={18} />
                  <div>
                    <span className="file-name">{file.file_name}</span>
                    {file.description && <span className="file-desc">{file.description}</span>}
                  </div>
                  <Download size={16} />
                </a>
              ))}
            </div>
          </div>
        )}

        {/* Citation */}
        {citationText && (
          <div className="research-detail-citation">
            <h3>Cite this report</h3>
            <div className="citation-box">
              <p>{citationText}</p>
              <button onClick={handleCopyCitation}>
                {citationCopied ? <Check size={16} /> : <Copy size={16} />}
                {citationCopied ? 'Copied' : 'Copy'}
              </button>
            </div>
          </div>
        )}

        {/* Funding */}
        {report.funding_acknowledgement && (
          <div className="research-detail-funding">
            <h3>Funding Acknowledgement</h3>
            <p>{report.funding_acknowledgement}</p>
          </div>
        )}

        {/* Engagement */}
        <div className="research-engagement-bar">
          <button className={`engagement-btn ${liked ? 'liked' : ''}`} onClick={handleLike} disabled={!isAuthenticated}>
            <Heart size={18} fill={liked ? 'currentColor' : 'none'} /> <span>{likeCount}</span>
          </button>
          <button className="engagement-btn" onClick={() => document.getElementById('research-comments')?.scrollIntoView({ behavior: 'smooth' })}>
            <MessageCircle size={18} /> <span>{comments.length}</span>
          </button>
        </div>
      </div>

      {/* Comments */}
      <section id="research-comments" className="research-comments-section">
        <div className="research-comments-inner">
          <h3>Discussion ({comments.length})</h3>
          {isAuthenticated ? (
            <form className="comment-form" onSubmit={handleComment}>
              {replyTo && (
                <div className="comment-replying-to">
                  Replying to comment <button type="button" onClick={() => setReplyTo(null)}>Cancel</button>
                </div>
              )}
              <textarea placeholder="Join the discussion..." value={commentText} onChange={(e) => setCommentText(e.target.value)} rows={3} maxLength={2000} />
              <button type="submit" disabled={!commentText.trim() || submitting}>
                <Send size={16} /> {submitting ? 'Posting...' : 'Post'}
              </button>
            </form>
          ) : (
            <p className="comment-signin-prompt"><Link to="/">Sign in</Link> to join the discussion.</p>
          )}
          <div className="comments-list">{comments.map((c) => renderComment(c))}</div>
        </div>
      </section>
    </div>
  );
}

export default ResearchDetail;
