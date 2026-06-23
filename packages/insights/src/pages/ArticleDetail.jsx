// src/pages/ArticleDetail.jsx - Public article detail with comments and likes
import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  ChevronLeft, Calendar, Eye, Heart, MessageCircle, Share2,
  RefreshCw, Send, Trash2, Reply, Copy, Check, LogIn
} from 'lucide-react';
import { usePublicAuth } from '../contexts/PublicAuthContext';
import articleService from '../services/articleService';
import useArticleTracking from '../hooks/useArticleTracking';
const ClimateWidgetRenderer = lazy(() => import('../components/climate/ClimateWidgetRenderer'));
import './ArticleDetail.css';

function ArticleDetail() {
  const { slug } = useParams();
  const navigate = useNavigate();
  const { user, isAuthenticated } = usePublicAuth();
  const [article, setArticle] = useState(null);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [liked, setLiked] = useState(false);
  const [likeCount, setLikeCount] = useState(0);
  const [commentText, setCommentText] = useState('');
  const [replyTo, setReplyTo] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [relatedArticles, setRelatedArticles] = useState([]);
  const viewRecorded = useRef(false);
  const contentRef = useRef(null);

  useArticleTracking(article?.id, contentRef, 'article');

  useEffect(() => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }
    const fetchArticle = async () => {
      setLoading(true);
      try {
        const data = await articleService.getBySlug(slug);
        setArticle(data);
        setLiked(data.user_has_liked);
        setLikeCount(data.like_count);
        const cmts = await articleService.getComments(data.id);
        setComments(cmts);
        if (!viewRecorded.current) {
          viewRecorded.current = true;
          articleService.recordView(data.id);
        }
        document.title = `${data.seo_title || data.title} | Auxein Regional Insights`;
        articleService.getRelated(slug).then(setRelatedArticles).catch(() => {});
      } catch (err) {
        setError(err.message || 'Article not found');
      } finally {
        setLoading(false);
      }
    };
    fetchArticle();
    return () => { document.title = 'Auxein Regional Insights | Free Climate Intelligence for NZ Wine'; };
  }, [slug, isAuthenticated]);

  const handleLike = async () => {
    if (!isAuthenticated || !article) return;
    try {
      if (liked) {
        const res = await articleService.unlike(article.id);
        setLikeCount(res.like_count);
        setLiked(false);
      } else {
        const res = await articleService.like(article.id);
        setLikeCount(res.like_count);
        setLiked(true);
      }
    } catch (err) {
      console.error('Like failed:', err);
    }
  };

  const handleComment = async (e) => {
    e.preventDefault();
    if (!commentText.trim() || !article) return;
    setSubmitting(true);
    try {
      const newComment = await articleService.addComment(
        article.id, commentText.trim(), replyTo
      );
      if (replyTo) {
        // Refresh all comments to get proper nesting
        const cmts = await articleService.getComments(article.id);
        setComments(cmts);
      } else {
        setComments([...comments, newComment]);
      }
      setCommentText('');
      setReplyTo(null);
    } catch (err) {
      console.error('Comment failed:', err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteComment = async (commentId) => {
    try {
      await articleService.deleteComment(commentId);
      const cmts = await articleService.getComments(article.id);
      setComments(cmts);
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  const handleCopyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const formatDate = (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-NZ', {
      day: 'numeric', month: 'long', year: 'numeric'
    });
  };

  // Simple Tiptap JSON renderer
  const renderBody = (body) => {
    if (!body || !body.content) return null;
    return body.content.map((node, i) => renderNode(node, i));
  };

  const renderNode = (node, key) => {
    if (!node) return null;
    const children = node.content ? node.content.map((child, i) => renderNode(child, `${key}-${i}`)) : null;

    switch (node.type) {
      case 'paragraph':
        return <p key={key}>{children}</p>;
      case 'heading': {
        const level = node.attrs?.level || 2;
        const Tag = `h${level}`;
        return <Tag key={key}>{children}</Tag>;
      }
      case 'text': {
        let text = node.text;
        if (node.marks) {
          node.marks.forEach((mark) => {
            if (mark.type === 'bold') text = <strong key={`${key}-b`}>{text}</strong>;
            if (mark.type === 'italic') text = <em key={`${key}-i`}>{text}</em>;
            if (mark.type === 'link') text = <a key={`${key}-a`} href={mark.attrs.href} target="_blank" rel="noopener noreferrer">{text}</a>;
          });
        }
        return text;
      }
      case 'bulletList':
        return <ul key={key}>{children}</ul>;
      case 'orderedList':
        return <ol key={key}>{children}</ol>;
      case 'listItem':
        return <li key={key}>{children}</li>;
      case 'blockquote':
        return <blockquote key={key}>{children}</blockquote>;
      case 'codeBlock':
        return <pre key={key}><code>{node.content?.[0]?.text}</code></pre>;
      case 'image': {
        const imgWidth = node.attrs?.width;
        const imgStyle = imgWidth && imgWidth !== '100'
          ? { width: `${imgWidth}%`, height: 'auto' }
          : { maxWidth: '100%', height: 'auto' };
        return <img key={key} src={node.attrs?.src} alt={node.attrs?.alt || ''} style={imgStyle} loading="lazy" />;
      }
      case 'climateWidget':
        return (
          <Suspense key={key} fallback={<div style={{ padding: '2rem', textAlign: 'center', color: '#9ca3af' }}>Loading chart...</div>}>
            <ClimateWidgetRenderer
              widgetType={node.attrs?.widgetType}
              zoneSlug={node.attrs?.zoneSlug}
              zoneName={node.attrs?.zoneName}
              zoneSlugs={node.attrs?.zoneSlugs || ''}
              zoneNames={node.attrs?.zoneNames || ''}
              metric={node.attrs?.metric}
              displayMode={node.attrs?.displayMode || 'chart'}
              title={node.attrs?.title}
              snapshotData={node.attrs?.snapshotData || null}
              vintages={node.attrs?.vintages || ''}
              includeBaseline={node.attrs?.includeBaseline !== false}
              seasonLimit={node.attrs?.seasonLimit || 10}
              scenario={node.attrs?.scenario || ''}
              period={node.attrs?.period || ''}
            />
          </Suspense>
        );
      case 'iframe': {
        const a = node.attrs || {};
        const h = Math.max(120, Number(a.height) || 600);
        const w = a.width || '100';
        return (
          <div key={key} style={{ width: `${w}%`, margin: '1rem auto' }}>
            <iframe
              src={a.src}
              title={a.title || 'Embedded content'}
              width="100%"
              height={h}
              sandbox={a.sandbox || 'allow-scripts allow-same-origin allow-popups allow-forms allow-presentation'}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              style={{ border: '1px solid #e5e7eb', borderRadius: '8px', display: 'block' }}
            />
          </div>
        );
      }
      case 'hardBreak':
        return <br key={key} />;
      default:
        return children ? <div key={key}>{children}</div> : null;
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
          <button
            className="comment-action-btn"
            onClick={() => { setReplyTo(comment.id); setCommentText(''); }}
          >
            <Reply size={14} /> Reply
          </button>
        )}
        {isAuthenticated && (comment.user_id === user?.id || user?.is_admin) && !comment.is_deleted && (
          <button
            className="comment-action-btn danger"
            onClick={() => handleDeleteComment(comment.id)}
          >
            <Trash2 size={14} /> Delete
          </button>
        )}
      </div>
      {comment.replies && comment.replies.length > 0 && (
        <div className="comment-replies">
          {comment.replies.map((reply) => renderComment(reply, depth + 1))}
        </div>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="article-detail-loading">
        <RefreshCw className="spin" size={24} />
        <p>Loading article...</p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="article-detail-gate">
        <div className="article-gate-card">
          <LogIn size={40} style={{ color: '#5B6830', marginBottom: '8px' }} />
          <h2>Sign in to read this article</h2>
          <p>Create a free account or sign in to access all articles and insights.</p>
          <div className="article-gate-actions">
            <Link to="/" className="article-gate-signin">Sign In / Sign Up</Link>
            <Link to="/articles" className="article-gate-back">
              <ChevronLeft size={16} /> Back to articles
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (error || !article) {
    return (
      <div className="article-detail-error">
        <p>{error || 'Article not found'}</p>
        <Link to="/articles">Back to articles</Link>
      </div>
    );
  }

  return (
    <div className="article-detail-page">
      {/* Hero */}
      <header className="article-detail-hero">
        <div className="article-detail-hero-content">
          <Link to="/articles" className="articles-back-link">
            <ChevronLeft size={16} /> All Articles
          </Link>
          {article.tags && article.tags.length > 0 && (
            <div className="article-detail-tags">
              {article.tags.map((t) => (
                <span key={t} className="article-tag">{t}</span>
              ))}
            </div>
          )}
          <h1>{article.title}</h1>
          <div className="article-detail-meta">
            {article.author_name && <span>{article.author_name}</span>}
            <span><Calendar size={14} /> {formatDate(article.published_at)}</span>
            <span><Eye size={14} /> {article.view_count} views</span>
          </div>
        </div>
      </header>

      {/* Featured Image */}
      {article.featured_image_url && (
        <div className="article-detail-featured-image">
          <img
            src={article.featured_image_url}
            alt={article.featured_image_alt || article.title}
          />
        </div>
      )}

      {/* Body */}
      <article className="article-detail-body">
        <div className="article-detail-body-content" ref={contentRef}>
          {renderBody(article.body)}
        </div>

        {/* Engagement Bar */}
        <div className="article-engagement-bar">
          <button
            className={`engagement-btn ${liked ? 'liked' : ''}`}
            onClick={handleLike}
            disabled={!isAuthenticated}
            title={isAuthenticated ? (liked ? 'Unlike' : 'Like') : 'Sign in to like'}
          >
            <Heart size={18} fill={liked ? 'currentColor' : 'none'} />
            <span>{likeCount}</span>
          </button>
          <button className="engagement-btn" onClick={() => document.getElementById('comments-section')?.scrollIntoView({ behavior: 'smooth' })}>
            <MessageCircle size={18} />
            <span>{comments.length}</span>
          </button>
          <button className="engagement-btn" onClick={handleCopyLink}>
            {copied ? <Check size={18} /> : <Copy size={18} />}
            <span>{copied ? 'Copied!' : 'Share'}</span>
          </button>
        </div>
      </article>

      {/* Related Articles */}
      {relatedArticles.length > 0 && (
        <section className="related-articles-section">
          <div className="related-articles-inner">
            <h3>Related Articles</h3>
            <div className="related-articles-grid">
              {relatedArticles.map((ra) => (
                <Link key={ra.id} to={`/articles/${ra.slug}`} className="related-article-card">
                  {ra.thumbnail_url && (
                    <div className="related-article-thumb">
                      <img src={ra.thumbnail_url} alt={ra.title} loading="lazy" />
                    </div>
                  )}
                  <div className="related-article-info">
                    <h4>{ra.title}</h4>
                    {ra.excerpt && <p>{ra.excerpt.length > 100 ? ra.excerpt.slice(0, 100) + '...' : ra.excerpt}</p>}
                    <span className="related-article-date">{formatDate(ra.published_at)}</span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Comments Section */}
      <section id="comments-section" className="article-comments-section">
        <div className="article-comments-inner">
          <h3>Comments ({comments.length})</h3>

          {isAuthenticated ? (
            <form className="comment-form" onSubmit={handleComment}>
              {replyTo && (
                <div className="comment-replying-to">
                  Replying to comment
                  <button type="button" onClick={() => setReplyTo(null)}>Cancel</button>
                </div>
              )}
              <textarea
                placeholder="Write a comment..."
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                rows={3}
                maxLength={2000}
              />
              <button type="submit" disabled={!commentText.trim() || submitting}>
                <Send size={16} /> {submitting ? 'Posting...' : 'Post Comment'}
              </button>
            </form>
          ) : (
            <p className="comment-signin-prompt">
              <Link to="/">Sign in</Link> to leave a comment.
            </p>
          )}

          <div className="comments-list">
            {comments.map((c) => renderComment(c))}
          </div>
        </div>
      </section>
    </div>
  );
}

export default ArticleDetail;
