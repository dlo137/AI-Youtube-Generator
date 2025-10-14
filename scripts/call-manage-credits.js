// Script to call manage-credits edge function directly
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://zxklggjxauvvesqwqvgi.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp4a2xnZ2p4YXV2dmVzcXdxdmdpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTg3NDE2NDIsImV4cCI6MjA3NDMxNzY0Mn0._OWdNPlmZs0N1tMY6HAcO-YWjHJHYcxbXmZ2qZv6Tuo';

const supabase = createClient(supabaseUrl, supabaseKey);

async function testManageCredits() {
  try {
    console.log('Getting current session...');

    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError || !session) {
      console.log('No active session found. You need to be logged in.');
      console.log('Please run this from your app where you are logged in, or sign in first.');
      return;
    }

    console.log('Session found for user:', session.user.email);
    console.log('\nCalling manage-credits function to get current credits...');

    const { data, error } = await supabase.functions.invoke('manage-credits', {
      body: { action: 'get' }
    });

    if (error) {
      console.error('Error:', error);
      return;
    }

    console.log('\nCurrent credits:', data);

    console.log('\nCalling reset to initialize proper credits...');

    const { data: resetData, error: resetError } = await supabase.functions.invoke('manage-credits', {
      body: { action: 'reset' }
    });

    if (resetError) {
      console.error('Reset Error:', resetError);
      return;
    }

    console.log('\nAfter reset:', resetData);
    console.log('\n✅ Done! Your credits should now be correct.');

  } catch (error) {
    console.error('Error:', error);
  }
}

testManageCredits();
