/*
 * BubbaBlox content fallback for the modern Roblox pages.
 *
 * The modern pages' content areas are rendered at runtime by Roblox's CDN
 * bundles, which need Roblox's data APIs (blocked cross-origin here). When a
 * content area stays empty or stuck on "Loading...", this script fills that
 * specific part using the repo's own BubbaBlox pages/components — keeping
 * Bubba's ORIGINAL design (light #e3e3e3 background, white flat cards with
 * the 0 1px 4px shadow, #343434 headings, #0055b3 links, #00a2ff tab
 * underline, Source Sans Pro) so it sits coherently under the modern navbar.
 * The rest of the page - the modern Roblox shell, nav, theme - is untouched,
 * and if the CDN bundle ever renders real content the fallback leaves it
 * alone.
 */
(function () {
  'use strict';
  if (!document.getElementById) return;

  var AREAS = {
    '/': null,               // landing/signup: keep as-is
    '/games': 'games-carousel-page',   // cached discover shell mount
    '/groups': 'group-container',      // cached group shell mount
    '/avatar': 'avatar-web-app',
    '/friends': 'friends-web-app',
    '/messages': 'private-message-web-app',
    '/catalog': 'catalog-react-container',
    '/inventory': 'inventory-container',
    '/trade': 'trades-web-app',
    '/transactions': 'transactions-web-app',
    '/robux': 'robux-redesign-page',
    '/subscription': 'roblox-subscription-container',
    '/redeem': 'redeem-gift-card-container',
    '/settings': 'user-account',
    '/help': 'safety-support-page-web-app',
  };

  var path = location.pathname;
  var areaId = AREAS[path];
  // profile routes (/profile and /users/:id/:tab) fill the profile content
  var isProfile = path === '/profile' || /^\/users\//.test(path);
  if (isProfile) areaId = 'profile-root';
  if (!areaId) return;

  var meta = document.querySelector('meta[name="user-data"]');
  var USER = {
    name: meta ? (meta.getAttribute('data-name') || 'Guest') : 'Guest',
    id: meta ? (meta.getAttribute('data-userid') || '') : '',
    verified: meta ? (meta.getAttribute('data-hasverifiedbadge') === 'true') : false,
  };

  /* ---- Bubba's original design tokens (2016-roblox-main styles) ---- */
  var F = '"Source Sans Pro",Arial,Helvetica,sans-serif';
  var page = 'background:#e3e3e3;color:#191919;font-family:' + F + ';font-size:14px;line-height:1.428;padding:18px 20px 40px;min-height:420px;';
  var h1 = 'font-size:30px;font-weight:400;color:#343434;margin:0 0 6px;letter-spacing:-0.5px;';
  var h2 = 'font-size:24px;font-weight:300;color:#343434;margin:22px 0 8px;';
  var card = 'background:#fff;border-radius:0;box-shadow:0 1px 4px 0 rgba(25,25,25,0.3);padding:16px;';
  var link = 'color:#0055b3;text-decoration:none;cursor:pointer;';
  var muted = 'color:#666;';
  var label = 'color:#c3c3c3;';
  var tabEntry = 'flex:1;text-align:center;font-size:18px;padding:8px 0;cursor:pointer;color:#343434;';
  var tabActive = 'box-shadow:0 -4px 0 0 #00a2ff inset;';
  var btn = 'background:#fff;border:1px solid #c3c3c3;border-radius:4px;font-size:16px;padding:4px 10px;cursor:pointer;color:#191919;text-decoration:none;display:inline-block;';
  var input = 'width:100%;border:1px solid #c3c3c3;border-radius:4px;padding:6px 8px;font-family:' + F + ';font-size:14px;color:#191919;background:#fff;box-sizing:border-box;';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function tabs(list, active) {
    var html = '<div style="background:#fff;border-radius:0;box-shadow:0 1px 4px 0 rgba(25,25,25,0.3);margin:14px 0 0;display:flex;padding:0 10px">';
    list.forEach(function (t) {
      html += '<div style="' + tabEntry + (t === active ? tabActive : '') + '">' + esc(t) + '</div>';
    });
    return html + '</div>';
  }
  function gameCard(title, sub, img, href) {
    var src = img || '';
    var thumb = src
      ? 'background-image:url(\'' + src + '\');background-size:cover;background-position:center;'
      : 'background:#f5f5f5;';
    var a = href ? 'href="' + esc(href) + '"' : '';
    return '<a ' + a + ' style="display:block;width:200px;background:#fff;box-shadow:0 1px 4px 0 rgba(25,25,25,0.3);text-decoration:none;color:#191919;' + (href ? '' : 'pointer-events:none;') + '">' +
      '<div style="height:110px;' + thumb + '"></div>' +
      '<div style="padding:10px 12px"><div style="font-size:14px;font-weight:600;color:#191919;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(title) + '</div>' +
      '<div style="font-size:12px;color:#666;margin-top:2px">' + esc(sub) + '</div></div></a>';
  }
/* ---- avatar: Bubba avatar editor (preview + tabs + body colors + scaling) ---- */
  function avatarHtml() {
    var colors = ['#F5CD30', '#B43C2D', '#5AAFD5', '#143C64', '#468C28', '#96DC8C', '#141414', '#000000'];
    var swatches = colors.map(function (c) {
      return '<div style="width:32px;height:32px;border-radius:50%;background:' + c + ';border:1px solid #c3c3c3;display:inline-block;margin:0 8px 8px 0;cursor:pointer" title="' + c + '"></div>';
    }).join('');
    return '<div style="' + page + '">' +
      '<h1 style="' + h1 + '">Avatar</h1>' +
      '<div style="display:flex;gap:20px;flex-wrap:wrap;margin-top:8px">' +
      '<div style="width:277px;height:352px;background:#fff;border:1px solid #c3c3c3;box-shadow:0 1px 4px 0 rgba(25,25,25,0.3);display:flex;align-items:center;justify-content:center;flex:0 0 auto">' +
      '<img src="/assets/images/Avatar/avatar-headshot-placeholder.svg" alt="Your avatar" style="width:180px;height:180px" /></div>' +
      '<div style="flex:1;min-width:260px">' +
      tabs(['Character', 'Inventory', 'Outfits', 'Body Colors'], 'Character') +
      '<div style="' + card + ';margin-top:14px"><h3 style="margin:0 0 12px;font-size:17px;color:#343434">Body Colors</h3>' + swatches + '</div>' +
      '<div style="' + card + ';margin-top:12px">' +
      '<div style="font-size:15px;font-weight:600;color:#343434;margin-bottom:6px">Scaling</div>' +
      '<input type="range" min="0" max="1" step="0.05" value="1" style="width:100%" disabled />' +
      '<div style="font-size:12px;' + muted + ';margin-top:4px">Scale your character (0.9 - 1.0)</div>' +
      '</div>' +
      '<div style="' + card + ';margin-top:12px;font-size:14px;color:#666">Inventory items you own will appear here once you browse the <a href="/catalog" style="' + link + '">Catalog</a>.</div>' +
      '</div></div></div>';
  }

  /* ---- settings: Bubba My Settings (Account Info / Security / Privacy) ---- */
  function settingsHtml() {
    function infoRow(labelText, value) {
      return '<p style="margin:0 0 6px;font-size:15px;' + label + '">' + labelText + ': <span style="' + muted + '">' + value + '</span> <span style="float:right;' + muted + ';cursor:pointer">Edit</span></p>';
    }
    return '<div style="' + page + '">' +
      '<h1 style="' + h1 + ';margin-bottom:0">My Settings</h1>' +
      tabs(['Account Info', 'Security', 'Privacy'], 'Account Info') +
      '<div style="margin-top:14px">' +
      '<div style="font-size:16px;' + muted + ';margin-bottom:6px">Account Info</div>' +
      '<div style="' + card + '">' +
      infoRow('Username', esc(USER.name)) +
      infoRow('Password', '**********') +
      infoRow('Email Address', '—') +
      '</div>' +
      '<div style="font-size:16px;' + muted + ';margin:16px 0 6px">Personal</div>' +
      '<div style="' + card + '">' +
      '<textarea rows="3" style="' + input + '" placeholder="Tell everyone about yourself..."></textarea>' +
      '<p style="font-size:12px;' + muted + ';margin:6px 0 0">Do not provide any details that can be used to identify you outside ROBLOX.</p>' +
      '<div style="display:flex;gap:8px;margin-top:10px">' +
      '<select style="flex:1;padding:4px;border:1px solid #c3c3c3;border-radius:2px;font-size:16px;background:#fff;color:#666"><option>Birthday Month</option><option>January</option><option>February</option><option>March</option></select>' +
      '<select style="flex:1;padding:4px;border:1px solid #c3c3c3;border-radius:2px;font-size:16px;background:#fff;color:#666"><option>Day</option></select>' +
      '<select style="flex:1;padding:4px;border:1px solid #c3c3c3;border-radius:2px;font-size:16px;background:#fff;color:#666"><option>Year</option></select>' +
      '</div>' +
      '<div style="margin-top:12px;font-size:15px;' + label + '">Gender: <span style="' + muted + ';cursor:pointer">Male</span> <span style="' + muted + ';cursor:pointer;margin-left:10px">Female</span></div>' +
      '<div style="float:right;margin-top:16px"><button style="' + btn + '">Save</button></div>' +
      '<div style="clear:both"></div>' +
      '</div>' +
      '<div style="font-size:16px;' + muted + ';margin:16px 0 6px">Security</div>' +
      '<div style="' + card + '">' +
      infoRow('Two-step verification', 'Off') +
      infoRow('Account password', '**********') +
      '</div>' +
      '<div style="font-size:16px;' + muted + ';margin:16px 0 6px">Privacy</div>' +
      '<div style="' + card + '">' +
      '<p style="margin:0 0 6px;font-size:15px;' + label + '">Trade privacy: <span style="' + muted + '">Anyone</span></p>' +
      '<p style="margin:0 0 6px;font-size:15px;' + label + '">Inventory privacy: <span style="' + muted + '">Everyone</span></p>' +
      '</div>' +
      '</div></div>';
  }

  /* ---- games: game rows only (the discover feed, no dashboard greeting) ---- */
  function gamesHtml() {
    // the one game on the site: Baseplate by Roblox
    return '<div style="' + page + '">' +
      '<h1 style="' + h1 + '">Games</h1>' +
      '<div style="display:flex;gap:16px;flex-wrap:wrap">' +
      gameCard('Baseplate', 'By Roblox', '', '/games/1/Baseplate') +
      '</div></div>';
  }

  /* ---- groups: generic group page (no cached data) ---- */
  function groupsHtml() {
    return '<div style="' + page + '">' +
      '<h1 style="' + h1 + '">Group</h1>' +
      '<div style="' + card + ';display:flex;gap:14px;align-items:center;flex-wrap:wrap">' +
      '<div style="width:96px;height:96px;background:#fff;border:1px solid #c3c3c3;border-radius:4px;display:flex;align-items:center;justify-content:center;color:#666;font-size:12px;flex:0 0 auto">No icon</div>' +
      '<div style="flex:1;min-width:180px"><div style="font-size:22px;font-weight:400;color:#343434">Group</div>' +
      '<div style="font-size:14px;color:#666">A group on Roblox.</div>' +
      '<div style="font-size:13px;color:#666;margin-top:4px">0 Members</div></div>' +
      '<a href="/games" style="' + btn + '">Join Group</a>' +
      '</div>' +
      '<div style="' + card + ';margin-top:14px"><div style="text-align:center;color:#666;font-size:15px;padding:18px 16px">Group wall posts will appear here.</div></div>' +
      '</div>';
  }

  /* ---- game details: one default game - Baseplate by Roblox (verified) ---- */
  function gamedetailsHtml() {
    return '<div style="' + page + '">' +
      '<h1 style="' + h1 + '">Baseplate</h1>' +
      '<div style="font-size:16px;font-weight:300;color:#666;margin:0 0 14px">By <a href="/profile" style="' + link + '">Roblox</a> <img src="/verified.svg" alt="Verified" style="width:16px;height:16px;margin-left:2px;vertical-align:middle" /></div>' +
      '<div style="display:flex;gap:16px;flex-wrap:wrap">' +
      '<div style="' + card + ';flex:1;min-width:220px;display:flex;align-items:center;justify-content:center;padding:20px;color:#666;font-size:14px">Baseplate image</div>' +
      '<div style="flex:1;min-width:220px">' +
      '<a href="/games" style="' + btn + ';display:inline-block;margin-bottom:10px">&#9654; Play</a>' +
      '<div style="' + card + '"><div style="font-size:13px;' + label + '">DESCRIPTION</div>' +
      '<div style="font-size:15px;color:#191919;margin-top:4px;line-height:1.5">The classic baseplate. A blank canvas to build, play, and imagine with friends.</div></div>' +
      '<div style="' + card + ';margin-top:12px;display:flex;gap:8px">' +
      '<div style="flex:1;text-align:center"><div style="font-size:20px;color:#343434">0</div><div style="font-size:12px;color:#666">Favorites</div></div>' +
      '<div style="flex:1;text-align:center"><div style="font-size:20px;color:#343434">0</div><div style="font-size:12px;color:#666">Visits</div></div>' +
      '<div style="flex:1;text-align:center"><div style="font-size:20px;color:#343434">0</div><div style="font-size:12px;color:#666">Active</div></div>' +
      '</div></div></div></div>';
  }

  /* ---- profile: clean modern profile (session user, no cached data) ---- */
  function profileHtml() {
    var verified = USER.verified
      ? '<img src="/verified.svg" alt="Verified" style="width:18px;height:18px;margin-left:4px;vertical-align:middle" />'
      : '';
    return '<div style="' + page + '">' +
      '<div style="' + card + ';display:flex;gap:18px;align-items:center;flex-wrap:wrap;padding:18px">' +
      '<div style="width:110px;height:110px;border-radius:50%;border:1px solid #B8B8B8;overflow:hidden;background:#fff;display:flex;align-items:center;justify-content:center;flex:0 0 auto">' +
      '<img src="/assets/images/Avatar/avatar-headshot-placeholder.svg" alt="" style="width:80px;height:80px" /></div>' +
      '<div style="flex:1;min-width:200px">' +
      '<div style="font-size:30px;font-weight:400;color:#343434;line-height:1.2">' + esc(USER.name) + ' ' + verified + '</div>' +
      '<div style="font-size:14px;color:#666;margin-top:2px">User ID: ' + esc(USER.id || '—') + '</div>' +
      '<div style="font-size:16px;font-weight:300;color:#666;margin-top:4px">Offline</div>' +
      '</div>' +
      '<a href="/settings" style="' + btn + '">Edit Profile</a>' +
      '</div>' +
      '<div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:14px">' +
      '<div style="' + card + ';flex:1;min-width:140px;text-align:center"><div style="font-size:24px;color:#343434">0</div><div style="font-size:13px;color:#666">Friends</div></div>' +
      '<div style="' + card + ';flex:1;min-width:140px;text-align:center"><div style="font-size:24px;color:#343434">0</div><div style="font-size:13px;color:#666">Followers</div></div>' +
      '<div style="' + card + ';flex:1;min-width:140px;text-align:center"><div style="font-size:24px;color:#343434">0</div><div style="font-size:13px;color:#666">Following</div></div>' +
      '</div>' +
      '<div style="font-size:24px;font-weight:300;color:#343434;margin:22px 0 8px">About</div>' +
      '<div style="' + card + ';color:#191919;font-size:15px;line-height:1.5">' + (USER.name === 'Guest' ? 'Say hello! Edit your profile to add a bio.' : 'This is the about section of your profile. Edit it in Settings.') + '</div>' +
      '<div style="font-size:24px;font-weight:300;color:#343434;margin:22px 0 8px">Creations</div>' +
      '<div style="' + card + '"><div style="text-align:center;color:#666;padding:20px 16px;font-size:15px">No creations yet. Use the <a href="/games" style="' + link + '">Create</a> tools to make your first experience!</div></div>' +
      '</div>';
  }

  var builders = {
    '/games': gamesHtml,
    '/groups': groupsHtml,
    '/avatar': avatarHtml,
    '/settings': settingsHtml,
    '/friends': function () { return '<div style="' + page + '"><h1 style="' + h1 + '">Friends</h1><div style="' + card + '"><div style="text-align:center;color:#666;padding:22px 16px;font-size:15px">You have no friends yet. Go play some games and make new friends! <a href="/games" style="' + link + '">Browse Games</a></div></div></div>'; },
    '/messages': function () { return '<div style="' + page + '"><h1 style="' + h1 + '">Messages</h1><div style="' + card + '"><div style="text-align:center;color:#666;padding:22px 16px;font-size:15px">Your inbox is empty.</div></div></div>'; },
    '/catalog': function () {
      var items =
        gameCard('Builders Club Hat', 'R$15', '', '/catalog') +
        gameCard('Turbo Builders Club Hat', 'R$35', '', '/catalog') +
        gameCard('Outrageous Builders Club Hat', 'R$60', '', '/catalog') +
        gameCard('Bubble Blox Cap', 'R$5', '', '/catalog') +
        gameCard('Roblox Point Pass', 'R$10', '', '/catalog') +
        gameCard('Classic T-Shirt', 'Free', '', '/catalog');
      return '<div style="' + page + '">' +
        '<h1 style="' + h1 + '">Catalog</h1>' +
        '<div style="background:#fff;box-shadow:0 1px 4px 0 rgba(25,25,25,0.3);display:flex;padding:0 10px;margin-top:8px">' +
        '<div style="' + tabEntry + tabActive + '">Featured</div><div style="' + tabEntry + '">All</div><div style="' + tabEntry + '">Hats</div><div style="' + tabEntry + '">Accessories</div><div style="' + tabEntry + '">Gear</div><div style="' + tabEntry + '">Bodies</div>' +
        '</div>' +
        '<div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:16px">' + items + '</div></div>';
    },
    '/inventory': function () { return '<div style="' + page + '"><h1 style="' + h1 + '">Inventory</h1><div style="' + card + '"><div style="text-align:center;color:#666;padding:22px 16px;font-size:15px">You don\'t own any items yet. Check out the <a href="/catalog" style="' + link + '">Catalog</a>!</div></div></div>'; },
    '/trade': function () { return '<div style="' + page + '"><h1 style="' + h1 + '">Trade</h1><div style="' + card + '"><div style="text-align:center;color:#666;padding:22px 16px;font-size:15px">You have no trades yet. Find an item you like and make an offer! <a href="/catalog" style="' + link + '">Browse Catalog</a></div></div></div>'; },
    '/transactions': function () { return '<div style="' + page + '"><h1 style="' + h1 + '">My Transactions</h1><div style="' + card + '"><div style="text-align:center;color:#666;padding:22px 16px;font-size:15px">You have no transactions yet.</div></div></div>'; },
    '/robux': function () {
      return '<div style="' + page + '">' +
        '<h1 style="' + h1 + '">Buy Robux</h1>' +
        '<div style="' + card + ';max-width:560px">' +
        '<div style="font-size:13px;' + label + '">YOUR BALANCE</div>' +
        '<div style="font-size:40px;font-weight:400;color:#F5BE3F;margin:2px 0 12px">R$0</div>' +
        '<div style="font-size:14px;color:#666;margin-bottom:14px">Robux are the virtual currency of BubbaBlox. Buy them to upgrade your avatar or buy special abilities in experiences.</div>' +
        '<a href="/robux-info" style="' + btn + '">Get Robux</a></div></div>';
    },
    '/subscription': function () {
      return '<div style="' + page + '">' +
        '<h1 style="' + h1 + '">Roblox Premium</h1>' +
        '<div style="' + card + ';max-width:560px">' +
        '<div style="font-size:18px;font-weight:600;color:#343434;margin-bottom:4px">You are on the Free plan</div>' +
        '<div style="font-size:14px;color:#666;margin-bottom:14px">Upgrade for daily Robux, the ability to sell items, and more.</div>' +
        '<a href="/buildersclub" style="' + btn + '">Upgrade</a></div></div>';
    },
    '/redeem': function () {
      return '<div style="' + page + '">' +
        '<h1 style="' + h1 + '">Redeem</h1>' +
        '<div style="' + card + ';max-width:480px">' +
        '<div style="font-size:14px;color:#666;margin-bottom:12px">Enter a Roblox gift card or promo code to get Robux and unlock an exclusive virtual item.</div>' +
        '<input type="text" placeholder="Enter your code here" style="' + input + '" />' +
        '<div style="margin-top:10px"><a href="/giftcards" style="' + btn + '">Redeem</a></div></div></div>';
    },
    '/help': function () {
      return '<div style="' + page + '">' +
        '<h1 style="' + h1 + '">Help &amp; Safety</h1>' +
        '<div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:12px">' +
        '<a href="https://discord.gg/bubba" target="_blank" rel="noopener" style="' + card + ';flex:1;min-width:200px;text-decoration:none;color:#191919"><div style="font-weight:600;font-size:16px;color:#343434;margin-bottom:4px">Join our Discord</div><div style="font-size:13px;color:#666">Get help from the community around the clock.</div></a>' +
        '<a href="/privacy" style="' + card + ';flex:1;min-width:200px;text-decoration:none;color:#191919"><div style="font-weight:600;font-size:16px;color:#343434;margin-bottom:4px">Privacy</div><div style="font-size:13px;color:#666">Learn how we protect your data.</div></a>' +
        '<a href="/tos" style="' + card + ';flex:1;min-width:200px;text-decoration:none;color:#191919"><div style="font-weight:600;font-size:16px;color:#343434;margin-bottom:4px">Terms of Service</div><div style="font-size:13px;color:#666">The rules of the road for BubbaBlox.</div></a>' +
        '</div></div>';
    },
  };

  var build = builders[path];
  if (isProfile) build = profileHtml;
  if (!build) return;

  var tries = 0;
  var timer = setInterval(function () {
    tries++;
    var area = document.getElementById(areaId);
    if (!area) { if (tries > 20) clearInterval(timer); return; }
    var text = (area.innerText || '').trim();
    // bundle rendered real content -> leave it alone (game details always
    // shows the default Baseplate page, so it always replaces)
    if (!isProfile && text && !/^loading/i.test(text)) { clearInterval(timer); return; }
    if (tries < 7) return; // give the bundle ~3.5s
    clearInterval(timer);
    try { area.innerHTML = build(); } catch (e) { /* ignore */ }
  }, 500);
})();
