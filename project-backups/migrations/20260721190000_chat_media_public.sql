-- Fix chat-media bucket: set to public so getPublicUrl() works.
-- Both CommunityFeatures.tsx and PrivateMessaging.tsx use getPublicUrl() which requires a public bucket.

update storage.buckets set public = true where id = 'chat-media';
