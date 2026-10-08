const pages = [...document.querySelectorAll('.demo-page')];
const tabs = [...document.querySelectorAll('.demo-tab')];

function showPage(name) {
  const selectedPage = pages.find((page) => page.id === name) || pages[0];
  for (const page of pages) {
    const active = page === selectedPage;
    page.classList.toggle('active', active);
    page.hidden = !active;
  }
  for (const tab of tabs) {
    if (tab.dataset.page === selectedPage.id) {
      tab.setAttribute('aria-current', 'page');
    } else {
      tab.removeAttribute('aria-current');
    }
  }
}

function navigateTo(name) {
  if (window.location.hash !== `#${name}`) {
    window.location.hash = name;
  } else {
    showPage(name);
  }
}

window.addEventListener('hashchange', () => showPage(window.location.hash.slice(1)));
showPage(window.location.hash.slice(1));

for (const tab of tabs) {
  tab.addEventListener('click', () => navigateTo(tab.dataset.page));
}
for (const button of document.querySelectorAll('[data-go]')) {
  button.addEventListener('click', () => navigateTo(button.dataset.go));
}

const examples = {
  greeting: {
    english: "It's great to meet you.",
    urdu: 'آپ سے مل کر خوشی ہوئی۔'
  },
  meeting: {
    english: "Shall we get started?",
    urdu: 'کیا ہم شروع کریں؟'
  },
  thanks: {
    english: 'Thank you for your time.',
    urdu: 'اپنا وقت دینے کا شکریہ۔'
  }
};

const englishText = document.querySelector('#englishText');
const urduText = document.querySelector('#urduText');
const sampleStatus = document.querySelector('#sampleStatus');
for (const button of document.querySelectorAll('[data-sample]')) {
  button.addEventListener('click', () => {
    const sample = examples[button.dataset.sample];
    if (!sample) return;
    englishText.value = sample.english;
    urduText.value = sample.urdu;
    sampleStatus.textContent = 'Showing a built-in sample pair. No text was sent to a service.';
  });
}

const meetingSamples = [
  {
    english: "Thanks for joining. Let's start with today's update.",
    urdu: 'شامل ہونے کا شکریہ۔ آئیے آج کی تازہ کاری سے آغاز کرتے ہیں۔'
  },
  {
    english: 'Please share your thoughts when you are ready.',
    urdu: 'جب آپ تیار ہوں تو براہِ کرم اپنی رائے بتائیں۔'
  },
  {
    english: "That sounds good. I'll send a short summary after the call.",
    urdu: 'یہ اچھا لگتا ہے۔ میں کال کے بعد ایک مختصر خلاصہ بھیج دوں گا۔'
  }
];
const liveState = document.querySelector('#liveState');
const liveLabel = liveState.querySelector('span');
const meetingEnglish = document.querySelector('#meetingEnglish');
const meetingUrdu = document.querySelector('#meetingUrdu');
const startMeeting = document.querySelector('#startMeeting');
const stopMeeting = document.querySelector('#stopMeeting');
let meetingTimer;
let sampleIndex = 0;

function stopMeetingPreview() {
  window.clearInterval(meetingTimer);
  meetingTimer = undefined;
  liveState.classList.remove('is-live');
  liveLabel.textContent = 'Sample paused';
  startMeeting.disabled = false;
  stopMeeting.disabled = true;
}

startMeeting.addEventListener('click', () => {
  if (meetingTimer) return;
  liveState.classList.add('is-live');
  liveLabel.textContent = 'Playing sample';
  startMeeting.disabled = true;
  stopMeeting.disabled = false;
  const showNextSample = () => {
    const sample = meetingSamples[sampleIndex % meetingSamples.length];
    meetingEnglish.textContent = sample.english;
    meetingUrdu.textContent = sample.urdu;
    sampleIndex += 1;
  };
  showNextSample();
  meetingTimer = window.setInterval(showNextSample, 3000);
});
stopMeeting.addEventListener('click', stopMeetingPreview);
