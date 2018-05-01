const Sequelize    = require('sequelize'),
      Op           = Sequelize.Op,
      async        = require('async'),
      bn           = require('bignumber.js'),
      db           = require('./models')

      query = {}

// Wallet queries
query.wallets_bulk_upsert = ( wallets ) => {
  return db.Wallets.bulkCreate( wallets, { updateOnDuplicate: true })
}

query.address_uniques = ( block_begin, block_end, callback ) => {
  let query = `SELECT \`from\` FROM transfers WHERE block_number>=${block_begin} AND block_number<=${block_end}
  UNION DISTINCT SELECT \`to\` FROM transfers WHERE block_number>=${block_begin} AND block_number<=${block_end}
  UNION DISTINCT SELECT address FROM claims WHERE block_number>=${block_begin} AND block_number<=${block_end}
  UNION DISTINCT SELECT address FROM buys WHERE block_number>=${block_begin} AND block_number<=${block_end};`
  db.sequelize
    .query(query, {type: db.sequelize.QueryTypes.SELECT})
    .then( results => {
      addresses = results.map( result => result.address || result.from || result.to  )
      callback( addresses )
    })
}

query.last_register = (address, begin, end, callback) => {
  db.Registrations
    .findAll({
      attributes: ['eos_key'],
      where: {
        address: address,
        [Op.and] : [
          {
            block_number: {
              [Op.gte] : begin
            }
          },
          {
            block_number: {
              [Op.lte] : end
            }
          }
        ]
      },
      order: [['block_number', 'DESC']],
      limit: 1
    })
    .then( results => callback( results.length ? results[0].dataValues.eos_key : null ) )
}

// Address qeuries
query.address_claims = (address, begin, end) => {
  return db.Claims
    .findAll({
      where : {
        address: address,
        [Op.and] : [
          {
            block_number: {
              [Op.gte] : begin
            }
          },
          {
            block_number: {
              [Op.lte] : end
            }
          }
        ]
      }
    })
}

query.address_buys = (address, begin, end) => {
  return db.Buys
    .findAll({
      where : {
        address: address,
        [Op.and] : [
          {
            block_number: {
              [Op.gte] : begin
            }
          },
          {
            block_number: {
              [Op.lte] : end
            }
          }
        ]
      }
    })
}

query.address_transfers_in = (address, begin, end) => {
  return db.Transfers
    .findAll({
      attributes: ['eos_amount'],
      where: {
        to: address,
        [Op.and] : [
          {
            block_number: {
              [Op.gte] : begin
            }
          },
          {
            block_number: {
              [Op.lte] : end
            }
          }
        ]
      }
    }, {type: db.sequelize.QueryTypes.SELECT})
}

query.address_transfers_out = (address, begin, end) => {
  return db.Transfers
    .findAll({
      attributes: ['eos_amount'],
      where: {
        from: address,
        [Op.and] : [
          {
            block_number: {
              [Op.gte] : begin
            }
          },
          {
            block_number: {
              [Op.lte] : end
            }
          }
        ]
      }
    }, {type: db.sequelize.QueryTypes.SELECT})
}

query.address_reclaimables = (address, begin, end) => {
  return db.Reclaimables
    .findAll({
      attributes: ['eos_amount'],
      where: {
        address: address,
        [Op.and] : [
          {
            block_number: {
              [Op.gte] : begin
            }
          },
          {
            block_number: {
              [Op.lte] : end
            }
          }
        ]
      }
    })
}

//tx range queries
query.transfers_in_range = (begin, end) => {
  return db.Transfers
    .findAll({
      attributes: ['from', 'to'],
      where: {
        [Op.and] : [
          {
            block_number: {
              [Op.gte] : begin
            }
          },
          {
            block_number: {
              [Op.lte] : end
            }
          }
        ]
      }
    })
}

query.registrations_in_range = (begin, end) => {
  return db.Registrations
    .findAll({
      attributes: ['address'],
      where: {
        [Op.and] : [
          {
            block_number: {
              [Op.gte] : begin
            }
          },
          {
            block_number: {
              [Op.lte] : end
            }
          }
        ]
      }
    })
}

query.buys_in_range = (begin, end) => {
  return db.Buys
    .findAll({
      attributes: ['address'],
      where: {
        [Op.and] : [
          {
            block_number: {
              [Op.gte] : begin
            }
          },
          {
            block_number: {
              [Op.lte] : end
            }
          }
        ]
      }
    })
}

query.claims_in_range = (begin, end) => {
  return db.Claims
    .findAll({
      attributes: ['address'],
      where: {
        [Op.and] : [
          {
            block_number: {
              [Op.gte] : begin
            }
          },
          {
            block_number: {
              [Op.lte] : end
            }
          }
        ]
      }
    })
}

query.destroy_above_block = (block_number, callback) => {
  async.series([
    next => db.Buys.destroy({ where : { block_number: { [Op.gte] : block_number } } }).then(next),
    next => db.Claims.destroy({ where : { block_number: { [Op.gte] : block_number } } }).then(next),
    next => db.Transfers.destroy({ where : { block_number: { [Op.gte] : block_number } } }).then(next),
    next => db.Registrations.destroy({ where : { block_number: { [Op.gte] : block_number } } }).then(next),
    next => db.Reclaimables.destroy({ where : { block_number: { [Op.gte] : block_number } } }).then(next)
  ], () => {
    callback()
  })
}

query.supply_liquid = () => {
  let query = `SELECT sum(balance_total) FROM wallets WHERE address!="${CS_ADDRESS_TOKEN}" AND address!="${CS_ADDRESS_CROWDSALE}"`
  if(!config.include_b1)
    query = `${query} AND address!="${CS_ADDRESS_B1}"`
  return db.sequelize.query(query, {type: db.sequelize.QueryTypes.SELECT})
}

query.count_accounts_registered = () => {
  return db.Wallets
    .count({
      where: { registered: true, valid: true  }
    })
}

query.sync_progress_destroy = () => {
  return db.State.destroy({
    where: {
      [Op.or] : [
        {meta_key: "sync_progress_buys"},
        {meta_key: "sync_progress_claims"},
        {meta_key: "sync_progress_registrations"},
        {meta_key: "sync_progress_transfers"},
        {meta_key: "sync_progress_reclaimables"}
      ]
    }
  })
}

query.count_transfers = () => {
  return db.Transfers.count()
}

query.count_buys = () => {
  return db.Buys.count()
}

query.count_claims = () => {
  return db.Claims.count()
}

query.count_registrations = () => {
  return db.Registrations.count()
}

query.count_reclaimables = () => {
  return db.Reclaimables.count()
}

query.set_deterministic_indices = () => {
  query = `update wallets target join
  (
       select address, (@rownumber := @rownumber + 1) as rownum
       from wallets
       cross join (select @rownumber := 0) r
       order by first_seen asc, address asc
  ) source on target.address = source.address
  set deterministic_index = rownum`
  return db.sequelize.query(query)
}

query.address_first_seen = address => {
  const query = `SELECT bn.block_number from (
  	(SELECT tf.block_number FROM transfers AS tf WHERE \`from\`="${address}" ORDER BY tf.block_number ASC LIMIT 1)
  	UNION
  	(SELECT tt.block_number FROM transfers AS tt WHERE \`to\`="${address}" ORDER BY tt.block_number ASC LIMIT 1)
  	UNION
  	(SELECT b.block_number FROM buys AS b WHERE address="${address}" ORDER BY b.block_number ASC LIMIT 1)
  	UNION
  	(SELECT c.block_number FROM claims AS c WHERE address="${address}" ORDER BY c.block_number ASC LIMIT 1)
  	UNION
  	(SELECT r.block_number FROM registrations AS r WHERE address="${address}"  ORDER BY r.block_number ASC LIMIT 1)
    ) AS bn ORDER BY bn.block_number ASC LIMIT 1`
  return db.sequelize.query(query, {type: db.sequelize.QueryTypes.SELECT})
}

module.exports = query
