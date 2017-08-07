// ==UserScript==
// @name			    Metafilter favorites browser
// @include			  http://*.metafilter.com/*
// @exclude			  http://www.metafilter.com/
// @icon			    http://mefi.us/styles/mefi/favicon.ico
// @grant			    GM_addStyle
// @version			  1.03
// @downloadURL	  https://raw.githubusercontent.com/coverprice/metafilter-favs/master/metafilter_favorites_browser.user.js
// ==/UserScript==

Global =  {
  last_tr: null,						      // Reference to the last TR tag in the select table that a user clicked on.
  table_bg_color: "gray",			    // Background color for the table rows.
  table_selected_color: "green",	// BG color for the selected table row.
  post_count_color: "white",
  fav_count_color: "#BBD",
  max_count: 100,					        // Largest possible # of favourites
  posts: [],							        // Stores info about each post
};

/**
 * ----------------------------------
 * Util
 * ----------------------------------
 * Various utility functions
 */
Util = {
	/**
	* Returns an array of DOM elements that match a given XPath expression.
	*
	* @param path string - Xpath expression to search for
	* @param from DOM Element - DOM element to search under. If not specified, document is used
	* @return Array - Array of selected nodes (if any)
	*/
	getNodes: function(path, from) {
		from = from || document;
		let item, ret = [];
		let iterator = document.evaluate(path, from, null, XPathResult.ANY_TYPE, null);
		while(item = iterator.iterateNext()) {
			ret.push(item);
		}
		return ret;
	},

	/**
	* Deletes a DOM element
	* @param DOM element - DOM element to remove
	* @return DOM element - the removed element
	*/
	removeElement: function(element) {
		return element.parentNode.removeChild(element);
	},
};

/**
 * Event handler for when user clicks on a table row
 */
function filterPosts(evt) {
	// Find the parent <TR> tag.
	let t = evt.target;
	while(t.tagName != "TR") {
		t = t.parentNode;
	}

	// Determine its ID and extract the number from it.
	/(\d+)$/.exec(t.id);
	let max_cnt = parseInt(RegExp.$1);

	// Hide/unhide all posts that don't match the chosen fav count.
	for(let i = 0; i < Global.posts.length; i++) {
        let is_showing = (Global.posts[i].div.style.display !== "none");
		let show = (Global.posts[i].num_favs >= max_cnt);
		if(show != is_showing) {
		    Global.posts[i].div.style.display = (show ? "" : "none");
		}
	}

	// Reset the color of the previous row to be clicked on.
	if(Global.last_tr !== null) {
		Global.last_tr.style.background = Global.table_bg_color;
	}
	// Set the color of the row we just clicked on
	t.style.background = Global.table_selected_color;
	Global.last_tr = t;
}

/**
 * Extract metadata from each comment into a more accessible array.
 */
function parseComments() {
	let fav_re = /\[(\d+) favorite/;
    // Extracts Date and time from text in the form "posted by Some Poster at H:MM PM on MONTH D[, YYYY]"
    let datetime_re = /at (\d+:\d\d\s*[AP]M)\s+on\s+([A-Za-z]+\s+\d+)(?:, (\d\d\d\d))?/;
	let comments = Util.getNodes('.//div[@class="comments"]');
	for(i = 0; i < comments.length; i++) {
		var comment_div = comments[i];
		if(!comment_div.previousElementSibling || comment_div.previousElementSibling.tagName !== "A") {
			continue;
		}
		let smallcopy = Util.getNodes('.//span[@class="smallcopy"]', comment_div)[0].textContent;
		let fav_count = (fav_re.exec(smallcopy) !== null) ? Math.min(parseInt(RegExp.$1), Global.max_count) : 0;
    let date_time = null;
    if(datetime_re.exec(smallcopy) !== null) {
      let time = RegExp.$1,
          date = RegExp.$2,
          year = (RegExp.$3 === undefined || RegExp.$3 === null) ? (new Date().getFullYear()) : RegExp.$3;
        date_time = Date.parse(`${date}, ${year} ${time}`);
    } else {
      console.log(`Could not parse date from ${smallcopy}`);
    }
		Global.posts.push({
			div: comment_div,
			num_favs: fav_count,
            date_time: date_time,
		});
  }
}

function fixUpDivs() {
  // Remove the 2 <br>'s following this comment into the div itself and add a style so that this
	// whitespace is preserved when we hide divs.
  let brs = Util.getNodes("//div[@class='comments']/following-sibling::br");
	for(let i = brs.length - 1; i >= 0; i--) {
        Util.removeElement(brs[i]);
	}
}

/**
 * Fav counts are higher for older posts because they've had more exposure. This method re-weights each post's fav count
 * according to its age, to more accurately group posts.
 */
function normalizeFavCount() {
  if(Global.posts.length === 0) {
    return;
  }
  let first_post_time = Global.posts[0].date_time;
  let last_post_time = Global.posts[Global.posts.length - 1].date_time;
  let delta_time = last_post_time - first_post_time;
  if(delta_time === 0) {
    return;
  }

  for(i = 0; i < Global.posts.length; i++) {
    let proportion = (Global.posts[i].date_time - first_post_time) / delta_time;
    if(proportion < 0.9999) {
      Global.posts[i].num_favs = Math.ceil(Global.posts[i].num_favs * 1 / (1 - proportion));
    }
  }
}

/**
 * Generates the table at the top of the page
 * @return void
 */
function drawTable() {
  if(Global.posts.length === 0) {
    return;
  }

  let table_html = '';
	let i;
	let fav_histogram = Array(Global.max_count + 1);
  // Prepare array for storing counts of how many posts have been favourited this many times.
	for(i = 0; i < fav_histogram.length; i++) {
		fav_histogram[i] = 0;
	}
  for(i = 0; i < Global.posts.length; i++) {
    let fav = Math.min(Global.posts[i].num_favs, Global.max_count);
    fav_histogram[fav]++;
  }

	// Generate the table rows
  let cum_total = 0;
	for(i = fav_histogram.length - 1; i >= 0; i--) {
		cum_total += fav_histogram[i];
    if(fav_histogram[i] > 0 || i === 0) {
	  table_html +=
      `<tr id="filter${i}">
			<td>${(i === 0) ? "All" : i}</td>
			<td>${cum_total}</td>
      <td><hr align="left" class="hr1" width="${Math.ceil(100 * cum_total / Global.posts.length)}%"/></td>
		  </tr>`;
	  }
	}

	// Insert table into page
  let dummyDiv = document.createElement('div');
  let page_div = document.getElementById("posts");
	dummyDiv.innerHTML = `<table id="favs_table">
    <thead>
      <tr>
        <th>Fav count</th>
        <th># visible posts</th>
        <th></th>
      </tr>
    </thead>
    <tbody>
      ${table_html}
    </tbody>
    </table>`;
	page_div.insertBefore(dummyDiv.firstChild, page_div.firstChild);

	// Add the event listeners.
	let rows = Util.getNodes('.//table[@id="favs_table"]/tbody/tr');
	for(i = 0; i < rows.length; i++) {
	  rows[i].addEventListener('click', filterPosts, false);
	}
}

function init() {
  GM_addStyle(
    `.comments {
      margin-bottom: 1em;
    }
    #favs_table {
      margin-left: 3em;
      width: 80%;
      border:1px solid white;
      border-collapse:collapse;
    }
		#favs_table tbody tr {
      cursor: pointer;
      border: 0px;
      background: ${Global.table_bg_color};
    }
    #favs_table td:nth-child(1) {
      color: ${Global.fav_count_color};
      width: 4em;
    }
    #favs_table td:nth-child(2) {
      color: ${Global.post_count_color};
      width: 4em;
    }
		#favs_table hr {
      height: 7px;
      margin-top: 2px;
      margin-bottom: 2px;
      border-radius: 10px;
      border-width:0;
    }
		.hr1 {
      color: ${Global.post_count_color};
      background-color: ${Global.post_count_color};
    }
		.hr2 {
      color: ${Global.fav_count_color};
      background-color: ${Global.fav_count_color};
    }`);
  parseComments();
  fixUpDivs();
  normalizeFavCount();
	drawTable();
}

init();
